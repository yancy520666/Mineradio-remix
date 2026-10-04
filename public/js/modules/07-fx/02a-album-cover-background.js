// Full-window backgrounds need their own image; playback thumbnails stay small.
var albumCoverBackgroundLoad = null;

function albumCoverBackgroundFullSource(src) {
  try {
    var url = new URL(src, window.location.href);
    if (url.origin === window.location.origin && url.pathname === '/api/cover') {
      url = new URL(url.searchParams.get('url'));
    }
    if (!/^https?:$/.test(url.protocol)) return src;
    if (/^p\d+\.music\.126\.net$/i.test(url.hostname)) {
      // The existing playback URL asks NetEase for a 400px thumbnail.
      var requestedSize = /^(\d+)y(\d+)$/.exec(url.searchParams.get('param') || '');
      if (requestedSize && Math.min(Number(requestedSize[1]), Number(requestedSize[2])) >= 2048) return src;
      url.searchParams.set('param', '2048y2048');
    } else if (/^(y\.qq\.com|y\.gtimg\.cn)$/i.test(url.hostname)) {
      url.pathname = url.pathname.replace(/\/T002R(\d+)x\d+M000/i, function (match, size) {
        return Number(size) < 800 ? '/T002R800x800M000' : match;
      });
      url.searchParams.delete('param');
    } else if (url.hostname === 'imge.kugou.com') {
      url.pathname = url.pathname.replace(/^(\/stdmusic\/)\d{1,4}\//, '$1');
      url.searchParams.delete('param');
    } else {
      // Preserve unknown and signed URLs rather than guessing their CDN syntax.
      return src;
    }
    return coverProxySrc(url.href, false) || src;
  } catch (e) {
    return src;
  }
}

function cancelAlbumCoverBackgroundLoad() {
  var load = albumCoverBackgroundLoad;
  albumCoverBackgroundLoad = null;
  if (!load) return;
  clearTimeout(load.timer);
  load.image.onload = load.image.onerror = null;
  load.image.removeAttribute('src');
}

function albumCoverBackgroundSource(src) {
  if (!customBackgroundUsesAlbumCover()) {
    cancelAlbumCoverBackgroundLoad();
    return src;
  }
  if (albumCoverBackgroundLoad && albumCoverBackgroundLoad.source === src) return albumCoverBackgroundLoad.src;
  cancelAlbumCoverBackgroundLoad();
  var candidate = albumCoverBackgroundFullSource(src);
  if (!src || candidate === src) return src;
  var image = new Image();
  image.decoding = 'async';
  var load = { source: src, src: src, image: image, timer: 0, finished: false };
  albumCoverBackgroundLoad = load;
  function release() {
    load.finished = true;
    clearTimeout(load.timer);
    image.onload = image.onerror = null;
    image.removeAttribute('src');
  }
  function ready() {
    if (load.finished || albumCoverBackgroundLoad !== load || !customBackgroundUsesAlbumCover()) return;
    // Recheck the live cover before promoting an asynchronous result.
    customBackgroundAlbumCoverSource();
    if (albumCoverBackgroundLoad !== load) return;
    load.src = candidate;
    release();
    refreshCustomBackgroundAlbumMedia();
  }
  image.onload = function () {
    if (!image.naturalWidth || !image.naturalHeight) { release(); return; }
    if (typeof image.decode === 'function') image.decode().then(ready, release);
    else ready();
  };
  image.onerror = release;
  // Keep this cover's fallback on error/timeout; control updates must not retry forever.
  load.timer = setTimeout(release, 15000);
  image.src = candidate;
  return src;
}
