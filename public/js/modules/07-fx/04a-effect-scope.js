// These overlays belong to different renderers. Keep saved preferences intact
// when a background cannot display an overlay.
function visualEffectScope(key) {
  var workshop = Number(fx.preset) === 8;
  var skull = typeof SKULL_PRESET_INDEX !== 'undefined' && Number(fx.preset) === SKULL_PRESET_INDEX;
  if (key === 'bloom') return {
    applicable: !workshop,
    hint: workshop ? '音域回响使用独立光效，此项不适用' : '封面粒子的溢光；需有可见粒子且强度大于 0'
  };
  if (key === 'edge') return {
    applicable: !workshop && !skull,
    hint: workshop || skull ? '当前背景不使用封面轮廓，此项不适用' : '增强封面粒子的图像边缘，不是歌词描边'
  };
  if (key === 'cinema') return {
    applicable: true,
    hint: workshop ? '作用于主场景镜头，不改变音域回响背景相机' : '主场景镜头漂移与鼓点推近；镜头强度需大于 0'
  };
  if (key === 'lyricGlowParticles') return {
    applicable: true,
    hint: '独立歌词光粒；拖动预览或展开歌单时收起局部光粒'
  };
  return null;
}

function updateVisualEffectScopeControls() {
  ['lyricGlowParticles', 'cinema', 'bloom', 'edge'].forEach(function (key) {
    var el = document.getElementById('t-' + key);
    if (!el) return;
    var scope = visualEffectScope(key);
    var label = el.querySelector('span:first-child');
    if (label) {
      label.classList.add('fx-effect-label');
      var hint = label.querySelector('.fx-effect-hint');
      if (!hint) {
        hint = document.createElement('small');
        hint.className = 'fx-effect-hint';
        label.appendChild(hint);
      }
      hint.textContent = scope.hint;
    }
    el.title = scope.hint;
    el.classList.toggle('effect-inapplicable', !scope.applicable);
    el.classList.toggle('on', scope.applicable && !!fx[key]);
    el.setAttribute('aria-disabled', String(!scope.applicable));
    el.setAttribute('aria-pressed', String(scope.applicable && !!fx[key]));
    if (key === 'bloom') {
      var strength = document.getElementById('fx-bloom');
      if (strength) {
        strength.disabled = !scope.applicable;
        strength.title = scope.hint;
      }
    }
  });
}
