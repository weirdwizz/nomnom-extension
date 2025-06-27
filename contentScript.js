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

  // Create modal
  const modal = document.createElement('div');
  modal.id = 'nomnom-modal';
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  modal.style.display = 'flex';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.style.zIndex = '9999';
  modal.addEventListener('click', (e) => {
      if (e.target === modal) {
          modal.remove();
      }
  });

  // Fetch the HTML for the editor
  fetch(chrome.runtime.getURL('nomnomEditor.html'))
    .then(response => response.text())
    .then(html => {
      // Create a temporary container to parse the HTML
      const temp = document.createElement('div');
      temp.innerHTML = html;

      // Get the editor container
      const editorContainer = temp.querySelector('#nomnom-editor');
      if (!editorContainer) {
          console.error('Editor container not found in HTML');
          return;
      }

      // Add the editor to the modal
      modal.appendChild(editorContainer);
      document.body.appendChild(modal);
      modal.style.display = 'flex';
      // Set the image
      document.getElementById('edit-image').src = imgSrc;
      // Dynamically resize the container to match the image aspect ratio
      const editImg = document.getElementById('edit-image');
      const container = document.getElementById('edit-image-container');
      editImg.onload = function() {
        const aspect = editImg.naturalWidth / editImg.naturalHeight;
        let baseSize = 500;
        let width = baseSize, height = baseSize;
        if (aspect > 1) {
          width = baseSize;
          height = baseSize / aspect;
        } else {
          height = baseSize;
          width = baseSize * aspect;
        }
        container.style.width = width + 'px';
        container.style.height = height + 'px';
        editImg.style.width = '100%';
        editImg.style.height = '100%';
      };
      
      // Initialize overlays array
      window.nomnomOverlays = [];
      
      // Set up Add NomNom button
      document.getElementById('add-nomnom-btn').onclick = () => {
        addNewNomNomOverlay();
      };
      document.getElementById('add-nomnom-leg-btn').onclick = () => {
        addNewNomNomOverlay('icons/nomnom-leg.png');
      };
      
      // Add the first overlay
      addNewNomNomOverlay();
      
      // Set up close button
      document.getElementById('nomnom-close').onclick = () => modal.remove();
      
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
          alert('No image found in clipboard!');
        } catch (e) {
          alert('Failed to read clipboard: ' + e);
        }
      }
      pasteBtn.onclick = handlePasteImage;
      
      // Focus the hidden input for paste shortcut
      const hiddenInput = document.getElementById('hidden-paste-input');
      if (hiddenInput) {
        hiddenInput.focus();
        hiddenInput.onpaste = (e) => {
          e.preventDefault();
          handlePasteImage();
        };
      }
    });
}

async function renderAndCopyOrInsert(action, commentArea) {
  const editImg = document.getElementById('edit-image');
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
  
  // Calculate scale factors for container to canvas
  const scaleX = canvas.width / container.offsetWidth;
  const scaleY = canvas.height / container.offsetHeight;
  
  // Draw each overlay
  for (const overlayContainer of window.nomnomOverlays) {
    // Get the overlay image inside the container
    const overlayImg = overlayContainer.querySelector('img');
    if (!overlayImg) continue;

    // Get overlay position, size
    const overlayLeft = overlayContainer.offsetLeft * scaleX;
    const overlayTop = overlayContainer.offsetTop * scaleY;
    const overlayWidth = overlayContainer.offsetWidth * scaleX;
    const aspectRatio = overlayImg.naturalWidth / overlayImg.naturalHeight;
    const overlayHeight = overlayWidth / aspectRatio;

    // Get rotation and flip from overlayImg.style.transform
    const transform = overlayImg.style.transform;
    let angle = 0;
    let isFlipped = false;
    if (transform) {
      const rotMatch = transform.match(/rotate\(([-0-9.]+)rad\)/);
      if (rotMatch) {
        angle = parseFloat(rotMatch[1]);
      }
      if (transform.includes('scaleX(-1)')) {
        isFlipped = true;
      }
    }

    // Draw the overlay with rotation and flip
    ctx.save();
    ctx.translate(overlayLeft, overlayTop); // Move to overlay's top-left
    ctx.translate(overlayWidth/2, overlayHeight/2); // Move to center of overlay
    ctx.rotate(angle);
    if (isFlipped) {
      ctx.scale(-1, 1); // Apply horizontal flip
    }
    ctx.drawImage(overlayImg, -overlayWidth/2, -overlayHeight/2, overlayWidth, overlayHeight);
    ctx.restore();
  }
  
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
    btn.innerHTML = `<img src="${chrome.runtime.getURL('icons/comment-nomnom-bold.png')}" alt="NomNom" style="width:22px;height:22px;">`;
    btn.onmouseover = () => {
        const img = btn.querySelector('img');
        if (img) {
            img.style.filter = 'brightness(0) saturate(100%) invert(48%) sepia(98%) saturate(1234%) hue-rotate(358deg) brightness(101%) contrast(101%)';
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

// Function to add a new NomNom overlay
function addNewNomNomOverlay(imgPath) {
  const container = document.getElementById('overlays-container');
  if (!container) return;

  // Create overlay container
  const overlayContainer = document.createElement('div');
  overlayContainer.className = 'nomnom-overlay';
  overlayContainer.style.position = 'absolute';
  overlayContainer.style.top = (50 + window.nomnomOverlays.length * 20) + 'px';
  overlayContainer.style.left = (50 + window.nomnomOverlays.length * 20) + 'px';
  overlayContainer.style.width = '100px';
  overlayContainer.style.height = '100px';
  overlayContainer.style.cursor = 'move';
  overlayContainer.style.zIndex = 2;
  overlayContainer.style.userSelect = 'none';
  overlayContainer.style.touchAction = 'none';

  // Create overlay image
  const overlayImg = document.createElement('img');
  overlayImg.src = chrome.runtime.getURL(imgPath || 'icons/nomnom.png');
  overlayImg.alt = 'NomNom overlay';
  overlayImg.style.width = '100%';
  overlayImg.style.height = '100%';
  overlayImg.style.pointerEvents = 'none'; // So handles/buttons get mouse events
  overlayImg.draggable = false;

  // Create remove button
  const removeBtn = document.createElement('button');
  removeBtn.textContent = '✕';
  removeBtn.className = 'remove-nomnom-btn';
  removeBtn.style.position = 'absolute';
  removeBtn.style.top = '50%';
  removeBtn.style.left = 'auto';
  removeBtn.style.right = '0';
  removeBtn.style.bottom = 'auto';
  removeBtn.style.transform = 'translateY(-50%)';
  removeBtn.style.height = '24px';
  removeBtn.style.background = 'none';
  removeBtn.style.border = 'none';
  removeBtn.style.cursor = 'pointer';
  removeBtn.onclick = (e) => {
    e.stopPropagation();
    overlayContainer.remove();
    window.nomnomOverlays = window.nomnomOverlays.filter(o => o !== overlayContainer);
  };

  // Add overlay image and remove button to container
  overlayContainer.appendChild(overlayImg);
  overlayContainer.appendChild(removeBtn);
  container.appendChild(overlayContainer);
  window.nomnomOverlays.push(overlayContainer);

  // Set up overlay interactions (move, resize, rotate, flip)
  setupOverlayInteractions(overlayContainer, overlayImg);
  return overlayContainer;
}

// Function to set up interactions for an overlay (drag, resize, rotate, flip)
function setupOverlayInteractions(overlayContainer, overlayImg) {
  const container = document.getElementById('edit-image-container');
  if (!container) return;

  let dragging = false, rotating = false;
  let startX, startY, startLeft, startTop, startAngle, centerX, centerY;
  let isFlipped = false;

  // Store the natural aspect ratio of the overlay image
  let overlayAspectRatio = 1;
  function setOverlayInitialSize() {
    if (overlayImg.naturalWidth && overlayImg.naturalHeight) {
      overlayAspectRatio = overlayImg.naturalWidth / overlayImg.naturalHeight;
      overlayContainer.style.width = '100px';
      overlayContainer.style.height = (100 / overlayAspectRatio) + 'px';
    }
  }
  if (overlayImg.naturalWidth && overlayImg.naturalHeight) {
    setOverlayInitialSize();
  } else {
    overlayImg.onload = setOverlayInitialSize;
  }

  // Create resize handles
  const corners = ['nw', 'ne', 'sw', 'se'];
  const resizeHandles = {};
  corners.forEach(corner => {
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    handle.dataset.corner = corner;
    // Restore original positioning
    handle.style.position = 'absolute';
    handle.style.width = '12px';
    handle.style.height = '12px';
    handle.style.background = '#ffd166';
    handle.style.borderRadius = '50%';
    handle.style.border = '2px solid #fff';
    handle.style.zIndex = '1002';
    if (corner === 'nw') {
        handle.style.top = '-6px';
        handle.style.left = '-6px';
        handle.style.cursor = 'nwse-resize';
    } else if (corner === 'ne') {
        handle.style.top = '-6px';
        handle.style.right = '-6px';
        handle.style.cursor = 'nesw-resize';
    } else if (corner === 'sw') {
        handle.style.bottom = '-6px';
        handle.style.left = '-6px';
        handle.style.cursor = 'nesw-resize';
    } else if (corner === 'se') {
        handle.style.bottom = '-6px';
        handle.style.right = '-6px';
        handle.style.cursor = 'nwse-resize';
    }
    overlayContainer.appendChild(handle);
    handle.onmousedown = (e) => {
        e.stopPropagation();
        const corner = handle.dataset.corner;
        startX = e.clientX;
        startY = e.clientY;
        const startWidth = overlayContainer.offsetWidth;
        const startHeight = overlayContainer.offsetHeight;
        startLeft = overlayContainer.offsetLeft;
        startTop = overlayContainer.offsetTop;
        const aspectRatio = overlayAspectRatio;
        document.onmousemove = (ev) => {
            let dx = ev.clientX - startX;
            let newWidth = startWidth;
            let newLeft = startLeft;
            if (corner === 'nw' || corner === 'sw') {
                newWidth = Math.max(30, startWidth - dx);
                newLeft = startLeft + (startWidth - newWidth);
            } else if (corner === 'ne' || corner === 'se') {
                newWidth = Math.max(30, startWidth + dx);
            }
            overlayContainer.style.width = newWidth + 'px';
            overlayContainer.style.height = (newWidth / aspectRatio) + 'px';
            overlayContainer.style.left = newLeft + 'px';
            if (corner === 'nw' || corner === 'ne') {
                overlayContainer.style.top = startTop + (startHeight - overlayContainer.offsetHeight) + 'px';
            }
        };
        document.onmouseup = () => {
            document.onmousemove = null;
            document.onmouseup = null;
        };
    };
  });

  // Create rotate handle
  const flipHandle = document.createElement('div');
  flipHandle.className = 'rotate-handle';
  flipHandle.style.top = '-22px';
  flipHandle.style.left = '50%';
  flipHandle.style.transform = 'translateX(-50%)';
  flipHandle.innerHTML = '<span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;font-size:12px;">⇄</span>';
  // Restore original styles for rotate handle
  flipHandle.style.position = 'absolute';
  flipHandle.style.top = '-22px';
  flipHandle.style.left = '50%';
  flipHandle.style.transform = 'translateX(-50%)';
  flipHandle.style.width = '16px';
  flipHandle.style.height = '16px';
  flipHandle.style.background = '#ffa600';
  flipHandle.style.borderRadius = '50%';
  flipHandle.style.border = '2px solid #fff';
  flipHandle.style.zIndex = '1002';
  flipHandle.style.display = 'flex';
  flipHandle.style.alignItems = 'center';
  flipHandle.style.justifyContent = 'center';
  flipHandle.style.color = '#fff';
  flipHandle.style.fontSize = '12px';
  flipHandle.style.cursor = 'grab';
  overlayContainer.appendChild(flipHandle);
  console.log('Appended rotate handle:', flipHandle, 'to', overlayContainer);

  // Create flip handle
  const rotateHandle = document.createElement('div');
  rotateHandle.className = 'flip-handle';
  rotateHandle.style.bottom = '-22px';
  rotateHandle.style.left = '50%';
  rotateHandle.style.transform = 'translateX(-50%)';
  rotateHandle.innerHTML = '<span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;font-size:12px;">↻</span>';
  // Restore original styles for flip handle
  rotateHandle.style.position = 'absolute';
  rotateHandle.style.bottom = '-22px';
  rotateHandle.style.left = '50%';
  rotateHandle.style.transform = 'translateX(-50%)';
  rotateHandle.style.width = '16px';
  rotateHandle.style.height = '16px';
  rotateHandle.style.background = '#ffa600';
  rotateHandle.style.borderRadius = '50%';
  rotateHandle.style.border = '2px solid #fff';
  rotateHandle.style.zIndex = '1002';
  rotateHandle.style.display = 'flex';
  rotateHandle.style.alignItems = 'center';
  rotateHandle.style.justifyContent = 'center';
  rotateHandle.style.color = '#fff';
  rotateHandle.style.fontSize = '12px';
  rotateHandle.style.cursor = 'pointer';
  overlayContainer.appendChild(rotateHandle);
  console.log('Appended flip handle:', rotateHandle, 'to', overlayContainer);

  // Store angle for rotation
  let currentAngle = 0;

  // Move
  overlayContainer.onmousedown = (e) => {
    if (e.target !== overlayContainer) return;
    dragging = true;
    startX = e.clientX - overlayContainer.offsetLeft;
    startY = e.clientY - overlayContainer.offsetTop;
    document.onmousemove = (ev) => {
      if (dragging) {
        let newLeft = ev.clientX - startX;
        let newTop = ev.clientY - startY;
        overlayContainer.style.left = newLeft + 'px';
        overlayContainer.style.top = newTop + 'px';
      }
    };
    document.onmouseup = () => {
      dragging = false;
      document.onmousemove = null;
      document.onmouseup = null;
    };
  };

  // Assign flip logic to flipHandle (top handle)
  flipHandle.onclick = (e) => {
    e.stopPropagation();
    isFlipped = !isFlipped;
    overlayImg.style.transform = `rotate(${currentAngle}rad) scaleX(${isFlipped ? -1 : 1})`;
  };

  // Assign rotate logic to rotateHandle (bottom handle)
  rotateHandle.onmousedown = (e) => {
    e.stopPropagation();
    rotating = true;
    const rect = overlayContainer.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
    // Calculate current angle
    const transform = overlayImg.style.transform;
    let initialAngle = 0;
    if (transform && transform.includes('rotate(')) {
      initialAngle = parseFloat(transform.match(/rotate\(([-0-9.]+)rad\)/)?.[1] || '0');
    }
    // Store the angle between mouse and center at drag start
    const startMouseAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    document.onmousemove = (ev) => {
      if (rotating) {
        const currentMouseAngle = Math.atan2(ev.clientY - centerY, ev.clientX - centerX);
        const delta = currentMouseAngle - startMouseAngle;
        currentAngle = initialAngle + delta;
        overlayImg.style.transform = `rotate(${currentAngle}rad) scaleX(${isFlipped ? -1 : 1})`;
      }
    };
    document.onmouseup = () => {
      rotating = false;
      document.onmousemove = null;
      document.onmouseup = null;
    };
  };

  // Prevent image drag ghost
  overlayContainer.ondragstart = () => false;
} 