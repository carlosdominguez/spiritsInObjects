
window.requestFileSystem = window.requestFileSystem ||
                           window.webkitRequestFileSystem;
window.resolveLocalFileSystemURL = window.webkitResolveLocalFileSystemURL ||
    window.webkitResolveLocalFileSystemURL;

var fs = null;
var cwd = null;
var DONE_MSG = 'Donezo';
var NOT_IMG_MSG = 'One or more files is not an image.';
var footer = document.querySelector('footer');

function setLoadingTxt(obj) {
  var el = document.querySelector('aside');
  if (obj && obj.txt) {
    var stayOpen = obj.stayOpen || false;
    var isError = obj.error || false;

    if (isError) {
      el.classList.add('red');
    }

    el.textContent = obj.txt;
    el.classList.add('show');

    if (!stayOpen) {
      window.setTimeout(setLoadingTxt, 3000);
    }
  } else {
    el.classList.remove('show');
    el.classList.remove('red');
  }
}

function writeFile(file, dirEntry, callback) {
  dirEntry.getFile(file.name, {create: true}, function(fileEntry) {
    fileEntry.createWriter(function(writer) {
      writer.onwriteend = callback;
      writer.onerror = callback;
      writer.write(file);
    }, onError);
  }, onError);
}

function onError(e) {
  switch (e.code) {
    case FileError.INVALID_MODIFICATION_ERR:
      setLoadingTxt({
        txt: 'Error: that directory path already exists',
        error: true
      });
      break;
    default:
      setLoadingTxt({txt: 'Error code: ' + e.code, error: true});
      break;
  }
}

function toArray(list) {
  return Array.prototype.slice.call(list || [], 0);
}

function readDirectory(dirEntry, callback) {
  var dirReader = dirEntry.createReader();
  var entries = [];

  // Call the reader.readEntries() until no more results are returned.
  var readEntries = function() {
     dirReader.readEntries (function(results) {
      if (!results.length) {
        callback(entries);
      } else {
        entries = entries.concat(toArray(results));
        readEntries();
      }
    }, onError);
  };

  readEntries(); // Start reading dirs.
}

function getEntry(fullPath, callback) {
  var fsUrl = fs.root.toURL() + fullPath;
  window.resolveLocalFileSystemURL(fsUrl, function(entry) {
    if (entry.isDirectory) {
      cwd = entry;
    }
    callback(entry);
  });
}

function onThumbnailClick(e) {
  var el = e.target.parentElement;

  if (el.tagName == 'FOOTER') {
    getEntry(cwd.fullPath + '/..', renderImages);
    return;
  }

  var isDirectory = Boolean(el.dataset.isDirectory);
  if (isDirectory) {
    getEntry(el.dataset.fullPath, renderImages);
  } else {
    getEntry(el.dataset.fullPath, function(entry) {
      window.open(entry.toURL());
    });
  }
}

function onClose(e) {
  e.stopPropagation();

  var el = e.target.parentElement;

  el.classList.add('slim');

  var onTransitionEnd = function(e) {
    if (e.propertyName == 'width') {
      getEntry(el.dataset.fullPath, function(entry) {
        el.parentElement.removeChild(el);

        entry.isDirectory ? entry.removeRecursively(function() {}, onError) :
                            entry.remove(function() {}, onError);
      });
    }
  };

  // Support every browser even though only Chrome supports the Filesystem
  // and drag and drop folder API. Hopefully someone will polyfill :)
  el.addEventListener('webkitTransitionEnd', onTransitionEnd);
  el.addEventListener('transitionend', onTransitionEnd);
  el.addEventListener('MSTransitionEnd', onTransitionEnd);
  el.addEventListener('oTransitionEnd', onTransitionEnd);
}

function renderImages(dirEntry) {
  readDirectory(dirEntry, function(entries) {
    // Handle no files case.
    if (!entries.length) {
      footer.textContent = 'Add some files chief!';
      footer.classList.add('nofiles');
      return;
    }

    footer.classList.remove('nofiles');

    var frag = document.createDocumentFragment();

    var span = document.createElement('span');
    span.innerHTML = '&laquo;';
    span.title = 'Move up a directory;';
    span.addEventListener('click', onThumbnailClick);
    frag.appendChild(span);

    entries.forEach(function(entry, i) {
      var div = document.createElement('div');

      div.dataset.fullPath = entry.fullPath;

      var img = new Image();
      if (entry.isDirectory) {
        img.src = 'folder.png';
        div.dataset.isDirectory = 'true';
      } else {
        //img.src = window.URL.createObjectURL(files[i]); // Equivalent to item.getAsFile().
        entry.file(function(f) {
          img.src = f.type.match('^image/') ? entry.toURL() : 'file.png';
        }, onError);
      }
    
      img.title = entry.name;
      img.alt = entry.name;

      var span = document.createElement('span');
      span.textContent = entry.name;

      var span2 = document.createElement('span');
      span2.textContent = 'X';
      span2.classList.add('close');
      span2.addEventListener('click', onClose);

      div.appendChild(span2);
      div.appendChild(img);
      div.appendChild(span);
      div.addEventListener('click', onThumbnailClick);

      frag.appendChild(div);
    });

    footer.innerHTML = '';
    footer.appendChild(frag);
  });
}

function onChange(e) {
  e.stopPropagation();
  e.preventDefault();

  var entries = e.target.webkitEntries;

  // Dragging and dropping into the file input works fine but onchange doesn't
  // populate .webkitEntries when selecting from the file dialog
  // (crbug.com/138987). Thus, we need to explicitly write out files.
  if (!entries.length) {
    var files = e.target.files;
    var numWritten = 0;

    [].forEach.call(files, function(f, i) {
      if (f.type.match('^image/')) {
        writeFile(f, cwd, function(e) {
          if (++numWritten) {
            setLoadingTxt({txt: DONE_MSG + ' writing ' + files.length + ' files.'});
            renderImages(cwd);
          }
        });
      } else {
        setLoadingTxt({txt: NOT_IMG_MSG, error: true});
      }
    });
    return;
  }

  [].forEach.call(entries, function(entry) {

    if (entry.isDirectory) {
      setLoadingTxt({
        txt: 'Importing directory: ' + entry.name,
        stayOpen: true
      });
    } else {
      setLoadingTxt({
        txt: 'Importing file: ' + entry.name,
        stayOpen: true
      });
    }

    // Copy entry over to the local filesystem.
    entry.copyTo(cwd, null, function(copiedEntry) {
      setLoadingTxt({txt: DONE_MSG});
      renderImages(cwd);
    }, onError);

  });
}

function onDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  var items = e.dataTransfer.items;
  var files = e.dataTransfer.files;

  for (var i = 0, item; item = items[i]; ++i) {
    // Skip this one if we didn't get a file.
    if (item.kind != 'file') {
      continue;
    }

    var entry = item.webkitGetAsEntry();
    if (entry.isDirectory) {
      setLoadingTxt({
        txt: 'Importing directory: ' + entry.name,
        stayOpen: true
      });

      // Copy the dropped DirectoryEntry over to our local filesystem.
      entry.copyTo(cwd, null, function(copiedEntry) {
        setLoadingTxt({txt: DONE_MSG});
        renderImages(cwd);
      }, onError);  
    } else {
      if (entry.isFile && files[i].type.match('^image/')) {
        // Copy the dropped entry into local filesystem.
        entry.copyTo(cwd, null, function(copiedEntry) {
          setLoadingTxt({txt: DONE_MSG});
          renderImages(cwd);
        }, onError); 
      } else {
        setLoadingTxt({txt: NOT_IMG_MSG, error: true});
      }
    }
  }
}

function init() {
  document.querySelector('input[type="file"]').addEventListener('change', onChange);

  var dropZone = document.querySelector('[dropzone]');

  dropZone.addEventListener('drop', onDrop);

  dropZone.addEventListener('dragover', function(e) {
    e.preventDefault(); // Necessary. Allows us to drop.
  });

  dropZone.addEventListener('dragenter', function(e) {
    e.target.classList.add('active');
  });

  dropZone.addEventListener('dragleave', function(e) {
    e.target.classList.remove('active');
  });

  window.addEventListener('keydown', function(e) {
    if (e.keyCode == 27) { // ESC
      document.querySelector('details').open = false;
    }
  });

  window.requestFileSystem(TEMPORARY, 1024 * 1204, function(fileSystem) {
    fs = fileSystem;
    cwd = fs.root;
    renderImages(cwd);
  }, onError);
}

init();
