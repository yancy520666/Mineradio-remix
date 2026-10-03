'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

async function probe(live) {
  markStartupGuideSeen('login');
  startupLoginGuideShown = true;
  closeLoginModal();
  markVisualGuideSeen();
  closeVisualGuide(true);
  const check = (value, message) => { if (!value) throw new Error(message); };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const liveResults = [];
  if (live) {
    for (const [provider, endpoint] of [['netease', '/api/song/comments?id=186016&limit=30'], ['qq', '/api/qq/song/comments?id=97773&limit=30'],
      ['kugou', '/api/kugou/song/comments?id=302362878&limit=30']]) {
      const first = await apiJson(endpoint + '&offset=0', { timeoutMs: 25000 });
      check(!first.error && first.comments && first.comments.length > 0, provider + ' public comments unavailable');
      const next = await apiJson(endpoint + '&offset=30', { timeoutMs: 25000 });
      check(!next.error && next.comments.every(c => !c.isHot), provider + ' later pages repeat hot comments');
      liveResults.push({ provider, hot: first.comments.filter(c => c.isHot).length,
        normal: first.comments.filter(c => !c.isHot).length, next: next.comments.length });
    }
    for (const config of [
      { provider: 'netease', id: '186016', parentId: '4956438' },
      { provider: 'qq', id: '97773', parentId: '1!pWdY9ocguBtMb1cIuNWXP.lsYfZ.CkPY7GPNa07kQo3adOvV9lkow1Xf-bReKPZ2' },
      { provider: 'kugou', id: '302362878', parentId: '678433417', resource: '100285259' },
    ]) {
      const endpoint = '/api/song/comment/replies?' + new URLSearchParams({ ...config, limit: '3' });
      const first = await apiJson(endpoint, { timeoutMs: 25000 });
      check(!first.error && first.comments && first.comments.length > 0, config.provider + ' public replies unavailable: ' + first.error);
      const next = await apiJson(endpoint + '&offset=' + (first.nextOffset || 0) + '&cursor=' + encodeURIComponent(first.nextCursor || ''), { timeoutMs: 25000 });
      check(!next.error && next.comments.some(c => !first.comments.some(old => old.id === c.id)), config.provider + ' reply cursor did not advance');
      liveResults.push({ provider: config.provider, replies: first.comments.length, nextReplies: next.comments.length });
    }
  }
  const requests = [];
  const replyRequests = [];
  let failReply = false;
  let dailyMode = 'ready';
  let failNext = false;
  const comment = (id, isHot) => ({ id, isHot, content: isHot
    ? '间奏的钢琴很动人，每次听都想再循环一遍。' : '晚归的路上听到这首歌，心情慢慢安静下来。',
    likedCount: isHot ? 126 : 3, time: 1700000000000, replyCount: id === 1 ? null : id === 2 ? 0 : 3, replyResource: '100',
    user: { id, nickname: isHot ? '认真听歌的人' : '夜行听众 ' + id } });
  apiJson = async url => {
    if (url.includes('/api/song/comment/replies?')) {
      const parsed = new URL(url, location.origin);
      const provider = parsed.searchParams.get('provider');
      const offset = provider === 'kugou' ? Number(parsed.searchParams.get('offset')) : Number(parsed.searchParams.get('cursor'));
      replyRequests.push({ provider, offset, parent: parsed.searchParams.get('parentId') });
      await pause(20);
      if (failReply) { failReply = false; throw new Error('reply offline fixture'); }
      const reply = id => ({ id, content: id === 'r0'
        ? '这段间奏我也很喜欢。第一次听是在回家的末班车上，窗外的灯一盏盏亮起来。\n现在再听，还是会想起那天。'
        : '赞同！' + '长文字与EnglishWordsWithoutSpaces'.repeat(5),
        user: { nickname: id === 'r0' ? '听歌路过的人' : '很长很长的用户昵称用来检查自动换行与边界' },
        replyTo: id === 'r0' ? '' : '认真听歌的人', time: 1700000000000, likedCount: 12 });
      return { comments: offset ? [reply('r1'), reply('r2')] : [reply('r0'), reply('r1')],
        total: 3, hasMore: !offset, nextOffset: 20, nextCursor: '20' };
    }
    if (url.includes('/api/kugou/recommendations')) {
      if (dailyMode === 'offline') throw new Error('offline fixture');
      if (dailyMode === 'login') return { songs: [], error: 'KUGOU_AUTH_REQUIRED', message: '请先连接酷狗账号，再读取每日推荐。' };
      return { mode: 'daily', songs: Array.from({ length: 30 }, (_, i) => ({
        id: 'hash-' + i, hash: 'hash-' + i, mixSongId: String(100 + i), provider: 'kugou',
        name: '每日推荐歌曲 ' + (i + 1), artist: '推荐歌手', album: '推荐专辑', duration: 180000 })) };
    }
    if (!url.includes('/comments?')) return {};
    const parsed = new URL(url, location.origin);
    const provider = parsed.pathname.includes('/qq/') ? 'qq' : parsed.pathname.includes('/kugou/') ? 'kugou' : parsed.pathname.includes('/qishui/') ? 'qishui' : 'netease';
    const offset = provider === 'qishui' ? Number(parsed.searchParams.get('cursor')) || 0 : Number(parsed.searchParams.get('offset'));
    requests.push({ provider, offset });
    await pause(20);
    if (failNext) { failNext = false; throw new Error('offline fixture'); }
    const normal = Array.from({ length: 30 }, (_, i) => comment(offset + i, false));
    const comments = !offset && provider !== 'qishui' ? [comment(0, true), comment('hot', true), ...normal] : normal;
    return { comments, hasMore: offset < 60, nextOffset: offset + 30, nextBefore: 1700000000000 - offset,
      nextCursor: String(offset + 30) };
  };
  const waitLoaded = async () => {
    for (let i = 0; i < 100 && (!detailCommentsState || detailCommentsState.loading); i++) await pause(20);
    check(detailCommentsState && !detailCommentsState.loading, 'Comments did not finish loading');
  };
  const open = async provider => {
    openTrackDetailModal('song', { id: '123', mixSongId: '123', qqId: '123', qqMid: 'fixture', provider, source: provider,
      name: '评论分页验证', artist: '测试歌手', album: '隔离测试', duration: 180 });
    await waitLoaded();
  };
  const providers = [];
  for (const provider of ['netease', 'qq', 'kugou', 'qishui']) {
    await open(provider);
    const target = document.getElementById('song-comments');
    const hot = target.querySelector('.detail-comments-hot');
    const more = target.querySelector('.detail-comments-more');
    const button = target.querySelector('.detail-comments-footer button');
    const hasHot = provider !== 'qishui';
    check(hot.hidden === !hasHot, 'Hot section must reflect upstream classification');
    check(hot.querySelectorAll('.comment-item').length === (hasHot ? 2 : 0), 'Hot comments classified incorrectly');
    check(more.querySelectorAll('.comment-item').length === (hasHot ? 29 : 30), 'First normal page lost or duplicated');
    if (hasHot) check(more.querySelector('h3').textContent.startsWith('更多评论'), 'More comments need a distinct heading');
    else check(more.querySelector('h3').textContent.startsWith('评论'), 'No empty hot heading on Qishui');
    check(target.querySelectorAll('.comment-replies-toggle').length === target.querySelectorAll('.comment-item').length - 2,
      'Unknown and zero reply counts must not show expanders');
    const replyToggle = target.querySelector('.comment-replies-toggle');
    const region = replyToggle.closest('[data-reply-key]');
    const key = region.getAttribute('data-reply-key');
    const waitReply = async () => {
      for (let i = 0; i < 100 && detailCommentsState.threads[key].loading; i++) await pause(20);
      check(!detailCommentsState.threads[key].loading, 'Replies did not finish loading');
    };
    replyToggle.click(); await waitReply();
    check(region.querySelectorAll('.comment-reply-item').length === 2, 'Reply expander did not load the initial page');
    check(replyToggle.getAttribute('aria-expanded') === 'true', 'Reply disclosure needs accessible expanded state');
    replyToggle.click();
    check(region.querySelector('.comment-replies-panel').hidden, 'Reply collapse must hide the panel');
    const beforeReopen = replyRequests.length;
    replyToggle.click(); await waitReply();
    check(replyRequests.length === beforeReopen, 'Reopening replies must reuse cached content');
    const replyMore = region.querySelector('[data-reply-action="load"]');
    failReply = true; replyMore.click(); await waitReply();
    check(replyMore.textContent === '重试' && region.querySelectorAll('.comment-reply-item').length === 2, 'Reply retry must preserve already loaded content');
    const beforeRetry = replyRequests.length;
    replyMore.click(); replyMore.click(); await waitReply();
    check(replyRequests.length === beforeRetry + 1, 'Reply clicks cannot duplicate page requests');
    check(region.querySelectorAll('.comment-reply-item').length === 3 && replyMore.hidden, 'Reply pages must deduplicate and stop at the end');
    const count = detailCommentsState.count;
    failNext = true;
    await loadMoreDetailComments();
    check(button.textContent.includes('重试') && !button.disabled, 'Failure must allow retry');
    check(detailCommentsState.count === count, 'Failure must preserve current comments');
    const previousRequests = requests.length;
    await Promise.all([loadMoreDetailComments(), loadMoreDetailComments()]);
    check(requests.length === previousRequests + 1, 'Repeated clicks issued duplicate pages');
    await loadMoreDetailComments();
    check(button.hidden && getComputedStyle(button).display === 'none', 'Last-page button must disappear');
    check(detailCommentsState.count === (hasHot ? 91 : 90), 'Expected three unique normal pages plus hot comments');
    check(hot.querySelectorAll('.comment-item').length === (hasHot ? 2 : 0), 'Later pages changed hot section');
    providers.push({ provider, count: detailCommentsState.count, hot: detailCommentsState.hotCount,
      normal: detailCommentsState.normalCount, buttonHidden: button.hidden });
  }
  // Leave the first page in view to inspect both headings together.
  await open('kugou');
  closeVisualGuide(true);
  await pause(350);
  const body = document.getElementById('track-detail-body');
  const hot = document.querySelector('.detail-comments-hot');
  body.scrollTop += hot.getBoundingClientRect().top - body.getBoundingClientRect().top - 12;
  await pause(100);
  const headings = Array.from(document.querySelectorAll('#song-comments h3')).map(node => {
    const bounds = node.getBoundingClientRect();
    const parent = node.parentElement.getBoundingClientRect();
    return { text: node.textContent, fits: bounds.left >= parent.left - 1 && bounds.right <= parent.right + 1 };
  });
  check(headings.every(heading => heading.fits), 'Comment heading overflows its section');
  check(body.scrollHeight > body.clientHeight && getComputedStyle(body).overflowY !== 'visible', 'Outer detail body must scroll');
  const moreSpacing = getComputedStyle(document.querySelector('.detail-comments-more')).marginTop;
  closeTrackDetailModal();
  openHomePlatformRecommendations('kugou');
  await loadHomePlatformRecommendations('kugou', true);
  for (let i = 0; i < 100 && homePlatformRecommendationState.feeds.kugou.loading; i++) await pause(20);
  const list = document.getElementById('home-platform-recommend-list');
  check(list.querySelectorAll('[data-home-recommend-kind="kugou-song"]').length === 30, 'Daily recommendations were truncated');
  check(list.querySelector('h3').textContent === '每日推荐', 'Daily section must be labelled accurately');
  let played = -1;
  playQueueAt = async index => { played = index; };
  list.querySelector('[data-home-recommend-index="4"]').click();
  await pause(50);
  check(played === 4 && playQueue.length === 30 && playQueue[4].provider === 'kugou', 'Daily card must play the complete Kugou queue');
  for (const mode of ['login', 'offline']) {
    dailyMode = mode;
    await loadHomePlatformRecommendations('kugou', false);
    check(list.querySelector('.home-platform-recommend-empty'), 'Daily error needs an informative empty state');
    check(list.textContent.includes(mode === 'login' ? '连接酷狗' : '接口当前不可用'), 'Daily error message is misleading');
  }
  dailyMode = 'ready';
  openHomePlatformRecommendations('kugou');
  await loadHomePlatformRecommendations('kugou', true);
  closeLoginModal();
  await pause(350);
  const tabs = document.getElementById('home-platform-recommend-tabs').getBoundingClientRect();
  check(Array.from(document.querySelectorAll('[data-home-recommend-source]')).every(node => {
    const rect = node.getBoundingClientRect();
    return rect.top >= tabs.top - 1 && rect.bottom <= tabs.bottom + 1;
  }), 'Recommendation platform tabs must remain fully visible in small windows');
  closeHomePlatformRecommendations();
  await open('kugou');
  const replyToggle = document.querySelector('#song-comments .comment-replies-toggle');
  replyToggle.click();
  await pause(150);
  const activeRegion = replyToggle.closest('.comment-replies');
  const parentItem = activeRegion.closest('.comment-item');
  const mainMetaStyle = getComputedStyle(parentItem.querySelector('.comment-main > .comment-meta'));
  const replyMetaStyle = getComputedStyle(activeRegion.querySelector('.comment-reply-meta'));
  const mainTextStyle = getComputedStyle(parentItem.querySelector('.comment-text'));
  const replyTextStyle = getComputedStyle(activeRegion.querySelector('.comment-reply-text'));
  check(parseFloat(replyMetaStyle.fontSize) < parseFloat(mainMetaStyle.fontSize)
    && parseFloat(replyTextStyle.fontSize) < parseFloat(mainTextStyle.fontSize), 'Replies must be smaller than the main comment');
  const opacity = color => Number(color.match(/, ([\d.]+)\)$/)[1]);
  check(opacity(replyMetaStyle.color) < opacity(mainMetaStyle.color)
    && opacity(replyTextStyle.color) < opacity(mainTextStyle.color), 'Replies must be dimmer than the main comment');
  check(!activeRegion.querySelector('.comment-reply-meta strong')
    && activeRegion.querySelector('.comment-reply-meta').textContent.includes(' · 12 赞 · '), 'Reply metadata must preserve the parent order and normal weight');
  const toggleStyle = getComputedStyle(replyToggle);
  check(toggleStyle.backgroundColor === 'rgba(0, 0, 0, 0)' && toggleStyle.borderTopWidth === '0px', 'Reply toggle must be a lightweight text link');
  check(getComputedStyle(activeRegion.querySelector('[data-reply-action="load"]')).backgroundColor
    === getComputedStyle(document.querySelector('.detail-comments-footer button')).backgroundColor, 'Both load-more actions must share the theme color');
  const replyBounds = activeRegion.getBoundingClientRect();
  check(Array.from(activeRegion.querySelectorAll('.comment-reply-text')).every(node => node.scrollWidth <= node.clientWidth + 1), 'Reply text overflows its available width');
  const mainComment = activeRegion.closest('.comment-item').getBoundingClientRect();
  check(replyBounds.right <= mainComment.right + 1, 'Reply region escapes the main comment');
  body.scrollTop += activeRegion.closest('.comment-item').getBoundingClientRect().top - body.getBoundingClientRect().top - 12;
  await pause(150);
  return { providers, headings, requests, replyRequests, liveResults, width: innerWidth, moreSpacing, replyHierarchy: true,
    daily: { count: homePlatformRecommendationState.feeds.kugou.songs.length, played, loginAndRetry: true } };
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-comments-ui-'));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const shotIndex = process.argv.indexOf('--shots');
const shotRoot = shotIndex >= 0 ? path.resolve(process.argv[shotIndex + 1]) : '';
try {
  if (shotRoot) fs.mkdirSync(shotRoot, { recursive: true });
  const page = path.join(temp, 'page.js');
  fs.writeFileSync(page, '(' + probe.toString() + ')(' + process.argv.includes('--live') + ')');
  for (const size of ['1280x820', '900x740']) {
    const args = [path.join(root, 'scripts/qa/isolated-electron.js'), '--page', page, '--size', size];
    if (shotRoot) args.push('--visible', '--shot', path.join(shotRoot, 'comments-' + size + '.png'));
    const run = spawnSync(require('electron'), args, { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 90000 });
    assert.equal(run.status, 0, run.stdout + run.stderr + String(run.error || ''));
    const line = run.stdout.split(/\r?\n/).find(value => value.startsWith('QA_RESULT '));
    assert(line, run.stdout + run.stderr);
    const result = JSON.parse(line.slice('QA_RESULT '.length));
    assert(!result.error, result.error);
    console.log('COMMENTS_UI:' + JSON.stringify(result));
  }
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
