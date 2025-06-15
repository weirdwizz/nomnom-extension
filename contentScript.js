// Helper to get a unique selector for the comment area (for later insertion)
function getUniqueSelector(el) {
  if (!el) return '';
  let path = '';
  while (el && el.nodeType === 1) {
    let selector = el.nodeName.toLowerCase();
    if (el.id) selector += `#${el.id}`;
    else if (el.className) selector += `.${el.className.trim().replace(/\s+/g, '.')}`;
    path = selector + (path ? '>' + path : '');
    el = el.parentElement;
  }
  return path;
}

// Helper to find post image in compose modal
function findPostImageInComposeModal(modal) {
  // 1. Try to find <img> with pbs.twimg.com/media/
  const imgs = modal.querySelectorAll('img');
  
  const img = modal.querySelector('img[src*="pbs.twimg.com/media/"]');
  if (img) {
    return img.src;
  }

  // 2. Try to find a div with background-image containing pbs.twimg.com/media/
  const bgDivs = modal.querySelectorAll('div[style*="background-image"]');
  
  for (const div of bgDivs) {
    const bg = div.style.backgroundImage;
    const match = bg.match(/url\("([^"]+)"\)/);
    if (match) {
      if (match[1].includes('pbs.twimg.com/media/')) {
        return match[1];
      }
    }
  }

  // 3. Try to find any div with a background-image that might contain the image
  const allDivs = modal.querySelectorAll('div');
  
  for (const div of allDivs) {
    const style = window.getComputedStyle(div);
    const bg = style.backgroundImage;
    if (bg && bg !== 'none') {
      const match = bg.match(/url\("([^"]+)"\)/);
      if (match && match[1].includes('pbs.twimg.com/media/')) {
        return match[1];
      }
    }
  }

  return null;
}

// Helper to find post image in regular post
function findPostImageInArticle(article) {
  if (!article) return null;

  // 1. Try to find <img> with pbs.twimg.com/media/
  const img = article.querySelector('img[src*="pbs.twimg.com/media/"]');
  if (img) return img.src;

  // 2. Try to find a div with background-image containing pbs.twimg.com/media/
  const bgDivs = article.querySelectorAll('div[style*="background-image"]');
  for (const div of bgDivs) {
    const bg = div.style.backgroundImage;
    const match = bg.match(/url\("([^"]+)"\)/);
    if (match && match[1].includes('pbs.twimg.com/media/')) {
      return match[1];
    }
  }

  // 3. No image found
  return null;
}

// Helper to find the underlying article (original post) behind a modal
function findUnderlyingArticle(modal) {
  // Get all articles in the DOM
  const articles = Array.from(document.querySelectorAll('article'));
  // Find the one that is not inside the modal
  for (const article of articles) {
    if (!modal.contains(article)) {
      // Optionally: check if it's visible (not display:none)
      const style = window.getComputedStyle(article);
      if (style.display !== 'none' && style.visibility !== 'hidden') {
        return article;
      }
    }
  }
  return null;
}

// --- Modal logic from nomnomEditor.js ---
function showNomnomEditor(imgSrc, commentArea) {
  // If modal already exists, remove it
  let modalElem = document.getElementById('nomnom-modal');
  if (modalElem) modalElem.remove();

  // Fetch the HTML for the editor
  fetch(chrome.runtime.getURL('nomnomEditor.html'))
    .then(res => res.text())
    .then(html => {
      const div = document.createElement('div');
      div.innerHTML = html;
      let modalElem = div.querySelector('#nomnom-modal');
      if (!modalElem) {
        modalElem = div.firstElementChild;
      }
      if (!modalElem) {
        alert('Failed to load NomNom editor modal!');
        return;
      }
      document.body.appendChild(modalElem);
      modalElem.style.display = 'flex';
      // Set the image
      document.getElementById('edit-image').src = imgSrc;
      // Dynamically resize the container to match the image aspect ratio
      const editImg = document.getElementById('edit-image');
      const container = document.getElementById('edit-image-container');
      editImg.onload = function() {
        const aspect = editImg.naturalWidth / editImg.naturalHeight;
        let width = 300, height = 300;
        if (aspect > 1) {
          width = 300;
          height = 300 / aspect;
        } else {
          height = 300;
          width = 300 * aspect;
        }
        container.style.width = width + 'px';
        container.style.height = height + 'px';
        editImg.style.width = '100%';
        editImg.style.height = '100%';
      };
      // Set the nomnom overlay image src dynamically
      document.getElementById('nomnom-overlay').src = chrome.runtime.getURL('icons/nomnom.png');
      // Set up close button
      document.getElementById('nomnom-close').onclick = () => modalElem.remove();
      // Set up overlay move/resize/rotate
      setupNomnomOverlay();
      // Set up copy/insert buttons
      document.getElementById('copy-btn').onclick = async () => {
        await renderAndCopyOrInsert('copy');
      };
      // Add insert button
      const insertBtn = document.createElement('button');
      insertBtn.id = 'insert-btn';
      insertBtn.textContent = 'Insert in comment';
      insertBtn.style.marginLeft = '8px';
      insertBtn.style.padding = '8px 16px';
      insertBtn.style.backgroundColor = '#1d9bf0';
      insertBtn.style.color = 'white';
      insertBtn.style.border = 'none';
      insertBtn.style.borderRadius = '4px';
      insertBtn.style.cursor = 'pointer';
      insertBtn.onclick = async () => {
        // Find the current comment area if not provided
        const currentCommentArea = commentArea || document.querySelector('div[data-testid="tweetTextarea_0"]');
        if (!currentCommentArea) {
          alert('Could not find comment area!');
          return;
        }
        await renderAndCopyOrInsert('insert', currentCommentArea);
      };
      document.getElementById('copy-btn').parentElement.appendChild(insertBtn);
      // Set up paste image button
      const pasteBtn = document.getElementById('paste-btn');
      async function handlePasteImage() {
        try {
          const clipboardItems = await navigator.clipboard.read();
          for (const item of clipboardItems) {
            if (item.types.includes('image/png') || item.types.includes('image/jpeg')) {
              const type = item.types.includes('image/png') ? 'image/png' : 'image/jpeg';
              const blob = await item.getType(type);
              const url = URL.createObjectURL(blob);
              document.getElementById('edit-image').src = url;
              return;
            }
          }
          alert('No image found in clipboard! Please copy an image first.');
        } catch (err) {
          alert('Failed to read clipboard: ' + err);
        }
      }
      if (pasteBtn) {
        pasteBtn.onclick = handlePasteImage;
      }
      // Auto-focus hidden input and handle its paste event for auto-paste
      const hiddenPasteInput = document.getElementById('hidden-paste-input');
      if (hiddenPasteInput) {
        hiddenPasteInput.focus();
        hiddenPasteInput.addEventListener('paste', (e) => {
          if (e.clipboardData) {
            const items = Array.from(e.clipboardData.items);
            const imageItem = items.find(item => item.type.startsWith('image/'));
            if (imageItem) {
              e.preventDefault();
              const blob = imageItem.getAsFile();
              const url = URL.createObjectURL(blob);
              document.getElementById('edit-image').src = url;
            }
          }
        });
      }
    });
}

function setupNomnomOverlay() {
  const overlay = document.getElementById('nomnom-overlay');
  const container = document.getElementById('edit-image-container');
  const handles = container.querySelectorAll('.resize-handle');
  const rotateHandle = container.querySelector('.rotate-handle');
  const flipHandle = container.querySelector('.flip-handle');

  let dragging = false, resizing = false, rotating = false;
  let startX, startY, startWidth, startHeight, startLeft, startTop, startAngle, centerX, centerY;
  let lastAngle = 0, lastWidth = 100, lastHeight = 100, lastLeft = 50, lastTop = 50;
  let currentCorner = null;
  let isFlipped = false;

  // Store the natural aspect ratio of the overlay image
  let overlayAspectRatio = 1;
  // Set overlay style to object-fit: contain to prevent CSS squishing
  overlay.style.objectFit = 'contain';

  function setOverlayInitialSize() {
    if (overlay.naturalWidth && overlay.naturalHeight) {
      overlayAspectRatio = overlay.naturalWidth / overlay.naturalHeight;
      // Set initial width and height to 100px wide, proportional height
      overlay.style.width = '100px';
      overlay.style.height = (100 / overlayAspectRatio) + 'px';
      overlay.style.objectFit = 'contain';
    }
  }
  if (overlay.naturalWidth && overlay.naturalHeight) {
    setOverlayInitialSize();
  } else {
    overlay.onload = setOverlayInitialSize;
  }

  // Helper to update handle positions
  function updateHandles() {
    const left = overlay.offsetLeft;
    const top = overlay.offsetTop;
    const width = overlay.offsetWidth;
    const height = overlay.offsetHeight;
    // Corners
    handles.forEach(handle => {
      const corner = handle.getAttribute('data-corner');
      if (corner === 'nw') {
        handle.style.left = (left - 10) + 'px';
        handle.style.top = (top - 10) + 'px';
      } else if (corner === 'ne') {
        handle.style.left = (left + width - 2) + 'px';
        handle.style.top = (top - 10) + 'px';
      } else if (corner === 'sw') {
        handle.style.left = (left - 10) + 'px';
        handle.style.top = (top + height - 2) + 'px';
      } else if (corner === 'se') {
        handle.style.left = (left + width - 2) + 'px';
        handle.style.top = (top + height - 2) + 'px';
      }
    });
    // Rotate handle (top center)
    if (rotateHandle) {
      rotateHandle.style.left = (left + width / 2 - 8) + 'px';
      rotateHandle.style.top = (top - 22) + 'px';
    }
    // Flip handle (bottom center)
    if (flipHandle) {
      flipHandle.style.left = (left + width / 2 - 8) + 'px';
      flipHandle.style.bottom = (container.offsetHeight - top - height - 6) + 'px';
    }
  }

  // Move
  overlay.onmousedown = (e) => {
    if (e.target.classList.contains('resize-handle') || e.target.classList.contains('rotate-handle') || e.target.classList.contains('flip-handle')) return;
    dragging = true;
    startX = e.clientX - overlay.offsetLeft;
    startY = e.clientY - overlay.offsetTop;
    document.onmousemove = (ev) => {
      if (dragging) {
        let newLeft = ev.clientX - startX;
        let newTop = ev.clientY - startY;
        // Remove container bounds check to allow moving outside
        overlay.style.left = newLeft + 'px';
        overlay.style.top = newTop + 'px';
        updateHandles();
      }
    };
    document.onmouseup = () => {
      dragging = false;
      document.onmousemove = null;
      document.onmouseup = null;
    };
  };

  // Force overlay height to match aspect ratio whenever width changes
  const enforceAspectRatio = () => {
    if (overlay.naturalWidth && overlay.naturalHeight) {
      const aspect = overlay.naturalWidth / overlay.naturalHeight;
      overlay.style.height = (overlay.offsetWidth / aspect) + 'px';
    }
  };
  const observer = new MutationObserver(() => {
    enforceAspectRatio();
  });
  observer.observe(overlay, { attributes: true, attributeFilter: ['style'] });

  // Patch resize logic: only allow width to change, always set height from aspect ratio
  handles.forEach(handle => {
    handle.onmousedown = (e) => {
      e.stopPropagation();
      resizing = true;
      currentCorner = handle.getAttribute('data-corner');
      startX = e.clientX;
      startY = e.clientY;
      startWidth = overlay.offsetWidth;
      startLeft = overlay.offsetLeft;
      startTop = overlay.offsetTop;
      // Calculate aspect ratio
      const aspectRatio = overlay.naturalWidth / overlay.naturalHeight;
      document.onmousemove = (ev) => {
        if (resizing) {
          let dx = ev.clientX - startX;
          let newWidth = startWidth;
          let newLeft = startLeft;
          let newTop = startTop;
          if (currentCorner === 'nw' || currentCorner === 'sw') {
            newWidth = Math.max(30, startWidth - dx);
            newLeft = startLeft + (startWidth - newWidth);
          } else if (currentCorner === 'ne' || currentCorner === 'se') {
            newWidth = Math.max(30, startWidth + dx);
          }
          overlay.style.width = newWidth + 'px';
          overlay.style.height = (newWidth / aspectRatio) + 'px';
          overlay.style.left = newLeft + 'px';
          overlay.style.top = newTop + 'px';
          updateHandles();
        }
      };
      document.onmouseup = () => {
        resizing = false;
        document.onmousemove = null;
        document.onmouseup = null;
      };
    };
  });

  // Rotate
  if (rotateHandle) {
    rotateHandle.onmousedown = (e) => {
      e.stopPropagation();
      rotating = true;
      const rect = overlay.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      centerX = rect.left + rect.width / 2;
      centerY = rect.top + rect.height / 2;
      // Calculate current angle
      const transform = overlay.style.transform;
      let initialAngle = 0;
      if (transform && transform.startsWith('rotate(')) {
        initialAngle = parseFloat(transform.match(/rotate\(([-0-9.]+)rad\)/)?.[1] || '0');
      }
      // Store the angle between mouse and center at drag start
      const startMouseAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      document.onmousemove = (ev) => {
        if (rotating) {
          const currentMouseAngle = Math.atan2(ev.clientY - centerY, ev.clientX - centerX);
          const delta = currentMouseAngle - startMouseAngle;
          overlay.style.transform = `rotate(${initialAngle + delta}rad) scaleX(${isFlipped ? -1 : 1})`;
        }
      };
      document.onmouseup = () => {
        rotating = false;
        document.onmousemove = null;
        document.onmouseup = null;
      };
    };
  }

  // Flip
  if (flipHandle) {
    flipHandle.onclick = (e) => {
      e.stopPropagation();
      isFlipped = !isFlipped;
      const transform = overlay.style.transform;
      let angle = 0;
      if (transform && transform.startsWith('rotate(')) {
        angle = parseFloat(transform.match(/rotate\(([-0-9.]+)rad\)/)?.[1] || '0');
      }
      overlay.style.transform = `rotate(${angle}rad) scaleX(${isFlipped ? -1 : 1})`;
    };
  }

  // Prevent image drag ghost
  overlay.ondragstart = () => false;
  updateHandles();

  // Debug log overlay and container properties
  console.log('Overlay:', {
    offsetLeft: overlay.offsetLeft,
    offsetTop: overlay.offsetTop,
    offsetWidth: overlay.offsetWidth,
    offsetHeight: overlay.offsetHeight,
    naturalWidth: overlay.naturalWidth,
    naturalHeight: overlay.naturalHeight
  });
  console.log('Container:', {
    offsetWidth: container.offsetWidth,
    offsetHeight: container.offsetHeight
  });

  // Debug logs for overlay and container
  console.log('overlay.offsetLeft:', overlay.offsetLeft);
  console.log('overlay.offsetTop:', overlay.offsetTop);
  console.log('overlay.offsetWidth:', overlay.offsetWidth);
  console.log('overlay.offsetHeight:', overlay.offsetHeight);
  console.log('container.offsetWidth:', container.offsetWidth);
  console.log('container.offsetHeight:', container.offsetHeight);
  console.log('window.getComputedStyle(container):', window.getComputedStyle(container));
  console.log('window.getComputedStyle(overlay):', window.getComputedStyle(overlay));
}

async function renderAndCopyOrInsert(action, commentArea) {
  const editImg = document.getElementById('edit-image');
  const overlay = document.getElementById('nomnom-overlay');
  const container = document.getElementById('edit-image-container');
  // Create a canvas
  const canvas = document.createElement('canvas');
  canvas.width = editImg.naturalWidth;
  canvas.height = editImg.naturalHeight;
  const ctx = canvas.getContext('2d');
  // Draw the main image
  const mainImg = new window.Image();
  mainImg.crossOrigin = 'anonymous';
  mainImg.src = editImg.src;
  await new Promise(res => { mainImg.onload = res; });
  ctx.drawImage(mainImg, 0, 0, canvas.width, canvas.height);
  // Calculate overlay position/size/rotation relative to the main image
  const scaleX = canvas.width / container.offsetWidth;
  const scaleY = canvas.height / container.offsetHeight;
  const overlayLeft = overlay.offsetLeft * scaleX;
  const overlayTop = overlay.offsetTop * scaleY;
  const overlayWidth = overlay.offsetWidth * scaleX;
  const aspectRatio = overlay.naturalWidth / overlay.naturalHeight;
  const overlayHeight = overlayWidth / aspectRatio;
  // Get rotation from transform
  const transform = overlay.style.transform;
  let angle = 0;
  if (transform && transform.startsWith('rotate(')) {
    angle = parseFloat(transform.match(/rotate\(([-0-9.]+)rad\)/)?.[1] || '0');
  }
  // Draw the overlay with rotation, aligning top-left then rotating around center
  ctx.save();
  ctx.translate(overlayLeft, overlayTop); // Move to overlay's top-left
  ctx.translate(overlayWidth/2, overlayHeight/2); // Move to center of overlay
  ctx.rotate(angle);
  ctx.drawImage(overlay, -overlayWidth/2, -overlayHeight/2, overlayWidth, overlayHeight);
  ctx.restore();
  // Export as blob
  canvas.toBlob(async (blob) => {
    if (!blob) return alert('Failed to render image!');
    if (action === 'copy') {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        // Close the modal
        const modalElem = document.getElementById('nomnom-modal');
        if (modalElem) modalElem.remove();
        // Focus the Twitter reply modal's comment box
        const commentBox = document.querySelector('[data-testid="tweetTextarea_0"]');
        if (commentBox) commentBox.focus();
      } catch (e) {
        alert('Failed to copy image to clipboard: ' + e);
      }
    } else if (action === 'insert' && commentArea) {
      try {
        // Create a File object from the blob
        const file = new File([blob], 'nomnom.png', { type: 'image/png' });
        
        // Find the compose modal
        const composeModal = document.querySelector('[data-testid="tweetTextarea_0"]')?.closest('[role="dialog"]');
        if (!composeModal) {
          throw new Error('Could not find compose modal');
        }

        // Find the image upload button
        const imageButton = composeModal.querySelector('[data-testid="fileInput"]');
        if (!imageButton) {
          throw new Error('Could not find image upload button');
        }

        // Create a new DataTransfer object and add the file
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);

        // Set the files property of the input
        imageButton.files = dataTransfer.files;

        // Dispatch a change event to trigger Twitter's image upload
        imageButton.dispatchEvent(new Event('change', { bubbles: true }));

        // Close the modal
        const modalElem = document.getElementById('nomnom-modal');
        if (modalElem) modalElem.remove();
      } catch (e) {
        alert('Failed to insert image: ' + e);
      }
    }
  }, 'image/png');
}

function injectNomNomReplyButtons() {
  // Find all reply buttons that don't already have a NomNom button next to them
  document.querySelectorAll('button[data-testid="reply"]').forEach(replyBtn => {
    if (replyBtn.parentElement.querySelector('.nomnom-reply-btn')) return;

    // Create the NomNom button
    const btn = document.createElement('button');
    btn.className = 'nomnom-reply-btn';
    btn.title = 'NomNom Reply';
    btn.type = 'button';
    btn.style.background = 'none';
    btn.style.border = 'none';
    btn.style.cursor = 'pointer';
    btn.style.marginLeft = '8px';
    btn.style.verticalAlign = 'middle';
    btn.innerHTML = `<img src="${chrome.runtime.getURL('icons/comment-nomnom.png')}" alt="NomNom" style="width:22px;height:22px;">`;
    btn.onmouseover = () => {
        const img = btn.querySelector('img');
        if (img) {
            img.style.filter = 'brightness(0) saturate(100%) invert(45%) sepia(98%) saturate(1234%) hue-rotate(187deg) brightness(97%) contrast(101%)';
        }
    };
    btn.onmouseout = () => {
        const img = btn.querySelector('img');
        if (img) {
            img.style.filter = 'none';
        }
    };

    // Insert after the reply button
    replyBtn.parentElement.appendChild(btn);

    // Click handler
    btn.onclick = (e) => {
      e.stopPropagation();
      // Find the closest article (post)
      const article = btn.closest('article');
      if (!article) return alert('Could not find post container!');
      // Try to find the image
      let img = article.querySelector('img[src*="pbs.twimg.com/media/"]');
      if (!img) {
        // Try background-image
        const bgDiv = Array.from(article.querySelectorAll('div[style*="background-image"]')).find(div =>
          div.style.backgroundImage.includes('pbs.twimg.com/media/')
        );
        if (bgDiv) {
          const match = bgDiv.style.backgroundImage.match(/url\("([^"]+)"\)/);
          if (match) img = { src: match[1] };
        }
      }
      if (!img) return alert('No image found in this post!');
      // Simulate click on the native reply button
      const replyBtn = btn.parentElement.querySelector('button[data-testid="reply"]');
      if (replyBtn) replyBtn.click();
      // Open the NomNom modal with the image
      showNomnomEditor(img.src, null);
    };
  });
}

// Observe DOM changes to inject buttons dynamically
const nomnomReplyObserver = new MutationObserver(() => {
  injectNomNomReplyButtons();
});
nomnomReplyObserver.observe(document.body, { childList: true, subtree: true });

// Initial injection
injectNomNomReplyButtons(); 