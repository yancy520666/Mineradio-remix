'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/js/modules/05-playback/07-search.js'), 'utf8');
function fn(name) {
  const start = source.search(new RegExp('^(?:async )?function '+name+'\\(', 'm'));
  assert(start >= 0, name);
  return source.slice(start, source.indexOf('\n}\n', start) + 2);
}
function load(s, names) { vm.runInNewContext(names.map(fn).join('\n'), s); return s; }
function deferred() { let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; }
function base() {
  return {
    window:{AbortController}, AbortController, console:{warn(){},error(){}},
    MUSIC_SEARCH_PROVIDER_TIMEOUT_MS:8000,MUSIC_SEARCH_MAX_RESULTS:180,
    searchTimer:null,clearTimeout(){},searchRequestSeq:1,searchMode:'song',searchResultType:'user',searchAbortController:null,
    $input:{value:'中文'},$results:{innerHTML:'',classList:{add(){},remove(){}}},
    typedSearchState:{key:'user|song|中文',query:'中文',mode:'song',type:'user',requestSeq:1,items:[{id:'u',name:'用户'}],providerPages:{},partial:false},
    searchMusicRenderState:{}, resetSearchMusicRenderState(){}, playlist:[],
    renders:[],renderTypedSearchResults(){},
  };
}
function nested() {
 const s=base();Object.assign(s,{searchInputComposing:false,renderSearchHistory:()=>false,isMusicSearchMode:()=>true,emptyHomeActive:true,updateSearchModeTabs(){},document:{getElementById:()=>null},doSearch(){}});s.$input.blur=()=>{};s.renderTypedSearchResults=(items,message)=>{s.typedSearchState.items=items;s.renders.push({items,message});};
 return load(s,['cancelPendingSearchTimer','abortActiveSearch','clearSearchResults','handleSearchInput','setSearchMode','typedSearchRequestIsCurrent','openTypedUserPlaylists','closeTypedUserPlaylists']);
}
for (const settle of ['resolve','reject']) for (const action of ['clear','input-empty','escape','provider','query','type','back','replace']) {
 test(`nested user ${settle} cannot repaint after ${action}`, async()=>{
  const s=nested(),d=deferred();let signal;s.apiJson=(_,opts)=>{signal=opts.signal;return d.promise;};
  const pending=s.openTypedUserPlaylists({id:'u',name:'用户'});
  if(action==='clear')s.clearSearchResults();
  if(action==='escape'){
   s.$input.addEventListener=(_,cb)=>s.keydown=cb;
   const start=source.indexOf("$input.addEventListener('keydown',");vm.runInNewContext(source.slice(start,source.indexOf("\n$results.addEventListener",start)),s);
   s.keydown({key:'Escape'});
  }
  if(action==='input-empty'){s.$input.value='';s.handleSearchInput({});}
  if(action==='provider')s.setSearchMode('qq');
  if(action==='query')s.$input.value='新词';
  if(action==='type')s.searchResultType='song';
  if(action==='back')s.closeTypedUserPlaylists();
  if(action==='replace')s.typedSearchState={...s.typedSearchState};
  const n=s.renders.length;
  if(settle==='resolve')d.resolve({playlists:[{id:5,name:'过期'}]});else d.reject(new Error('offline'));
  await pending;assert.equal(s.renders.length,n);
  if(['clear','escape','input-empty','back'].includes(action))assert.equal(signal.aborted,true);
 });
}
test('nested user failure can retry and retains original users for back navigation',async()=>{
 const s=nested();let tries=0;s.apiJson=async()=>{if(++tries===1)throw new Error('offline');return {playlists:[{id:2,name:'歌单'}]};};
 const user={id:'u',name:'用户'};await s.openTypedUserPlaylists(user);assert.equal(s.typedSearchState.userFailed,true);
 await s.openTypedUserPlaylists(user);assert.equal(s.renders.at(-1).items[0].name,'歌单');s.closeTypedUserPlaylists();assert.equal(s.renders.at(-1).items[0].id,'u');
});
test('IME Enter never prevents candidate confirmation or submits unfinished pinyin',()=>{
 const s={searchInputComposing:false,$input:{value:'zhou',addEventListener:(_,cb)=>s.listener=cb},calls:0,clearTimeout(){},searchTimer:null,isMusicSearchMode:()=>true,searchMode:'song',playlist:[],doSearch:()=>s.calls++};
 const start=source.indexOf("$input.addEventListener('keydown',");vm.runInNewContext(source.slice(start,source.indexOf("\n$results.addEventListener",start)),s);
 for(const event of [{isComposing:true},{keyCode:229},{}]){s.searchInputComposing=Object.keys(event).length===0;let prevented=false;s.listener({key:'Enter',...event,preventDefault(){prevented=true;}});assert.equal(prevented,false);}
 assert.equal(s.calls,0);s.searchInputComposing=false;s.listener({key:'Enter',preventDefault(){}});assert.equal(s.calls,1);
});
test('explicit search cancels queued debounce even when typed route is used',async()=>{
 const s={searchTimer:9,clearTimeout:id=>s.cancelled=id,searchMode:'song',searchResultType:'artist',doTypedSearch:q=>s.query=q};load(s,['cancelPendingSearchTimer','doSearch']);await s.doSearch('中文');assert.equal(s.cancelled,9);assert.equal(s.searchTimer,null);assert.equal(s.query,'中文');
});
function music() {
 const s=base();s.activeSearchProvidersForMode=()=>['netease','qq'];s.searchProviderUrl=(p,q,l,o)=>p+':'+o;s.controlSourceProviderTitle=p=>p;s.mergeSongSearchResults=(...args)=>args.slice(0,4).flat();
 return load(s,['searchProviderPagesHaveMore','searchProviderPagesHaveFailed','fetchMusicSearchResults']);
}
test('all failed providers retain retriable offsets, distinguish genuine empty, and retry only failures',async()=>{
 const s=music();s.activeSearchProvidersForMode=()=>['netease','qq','kugou','qishui'];let calls=[];s.apiJson=async url=>{calls.push(url);throw new Error('offline');};
 const failed=await s.fetchMusicSearchResults('中文','song');assert(s.searchProviderPagesHaveFailed(failed.providerPages));assert(failed.hasMore);assert.equal(Object.keys(failed.providerPages).length,4);assert(Object.values(failed.providerPages).every(p=>p.failed));assert.equal(failed.providerPages.qq.nextOffset,0);
 calls=[];s.apiJson=async url=>{calls.push(url);return {songs:[],hasMore:false};};
 const prior={netease:{nextOffset:18,hasMore:true,failed:false},qq:{nextOffset:12,hasMore:true,failed:true}};
 const retry=await s.fetchMusicSearchResults('中文','song',prior,{retryFailed:true});assert.deepEqual(calls,['qq:12']);assert.equal(retry.providerPages.netease.nextOffset,18);assert.equal(retry.providerPages.qq.failed,false);
 const empty=await s.fetchMusicSearchResults('中文','song');assert.equal(s.searchProviderPagesHaveFailed(empty.providerPages),false);assert.equal(empty.hasMore,false);
});
test('all-provider failure paints retry, never a no-results message',async()=>{
 const s=music();Object.assign(s,{searchResultType:'song',searchProviderNotice:'',searchResultKey:(q,m)=>m+'|'+q,disconnectSearchLoadMoreObserver(){},setSearchHistorySurface(){},searchTypeBarHtml:()=>'',searchOverviewHtml:()=>'',escHtml:x=>x,apiJson:async()=>{throw new Error('offline');}});
 load(s,['cancelPendingSearchTimer','abortActiveSearch','searchLoadMoreSentinelHtml','doSearch']);await s.doSearch('中文');assert.match(s.$results.innerHTML,/加载失败，请重试/);assert.doesNotMatch(s.$results.innerHTML,/没有找到/);
});
test('music next page is aborted on clear and ignores late resolution',async()=>{
 const s=music(),d=deferred();let signal;
 Object.assign(s,{searchLastResultQuery:'song|中文',searchMusicRenderState:{key:'song|中文',query:'中文',mode:'song',songs:[],providerPages:{netease:{nextOffset:18,hasMore:true}},remoteHasMore:true},refreshSearchLoadMoreSentinel(){},fetchMusicSearchResults:(q,m,p,o)=>{signal=o.signal;return d.promise;}});
 load(s,['cancelPendingSearchTimer','abortActiveSearch','clearSearchResults','loadNextMusicSearchPage']);const pending=s.loadNextMusicSearchPage('song|中文');s.clearSearchResults();assert(signal.aborted);d.resolve({songs:[{name:'旧'}]});assert.equal(await pending,false);
});
test('failed typed page stops automatic retry; manual retry keeps offset and only retries failed provider',async()=>{
 const s=base();Object.assign(s,{searchResultType:'artist',mergeTypedSearchItems:p=>Object.values(p).flat(),renderTypedSearchResults(){}});
 s.typedSearchState={...s.typedSearchState,type:'artist',items:[],providerPages:{netease:{nextOffset:18,hasMore:true},qq:{nextOffset:12,hasMore:true}}};
 let urls=[];s.apiJson=async url=>{urls.push(url);if(url.includes('provider=qq'))throw new Error('offline');return {items:[{provider:'netease',id:1}],nextOffset:19,hasMore:true};};
 load(s,['searchProviderPagesHaveFailed','fetchTypedSearchProviderPage','typedSearchRequestIsCurrent','loadNextTypedSearchPage']);await s.loadNextTypedSearchPage();assert.equal(s.typedSearchState.providerPages.qq.nextOffset,12);assert.equal(s.typedSearchState.providerPages.qq.failed,true);
 urls=[];assert.equal(await s.loadNextTypedSearchPage(),false);assert.equal(urls.length,0);
 s.apiJson=async url=>{urls.push(url);return {items:[{provider:'qq',id:2}],nextOffset:13,hasMore:false};};await s.loadNextTypedSearchPage(true);assert.equal(urls.length,1);assert.match(urls[0],/provider=qq.*offset=12$/);assert.equal(s.typedSearchState.items.length,2);
});
test('typed initial transport/timeout failure renders a retry control instead of no matches',async()=>{
 const s=base();Object.assign(s,{searchResultType:'artist',typedSearchProvidersFor:()=>['netease','qq'],searchResultTypeLabel:()=> '歌手',searchResultKey:(q,m)=>m+'|'+q,disconnectSearchLoadMoreObserver(){},setSearchHistorySurface(){},searchTypeBarHtml:()=>'',focusedSearchTypeTab:()=>null,restoreSearchTypeTabFocus(){},mergeTypedSearchItems:p=>Object.values(p).flat(),escHtml:x=>x,apiJson:async()=>{const e=new Error('timeout');e.name='TimeoutError';throw e;}});
 load(s,['cancelPendingSearchTimer','abortActiveSearch','searchProviderPagesHaveFailed','searchProviderPagesHaveMore','renderTypedSearchResults','fetchTypedSearchProviderPage','doTypedSearch']);
 await s.doTypedSearch('中文');assert.match(s.$results.innerHTML,/data-typed-load-more/);assert.match(s.$results.innerHTML,/加载失败，请重试/);assert.doesNotMatch(s.$results.innerHTML,/没有找到/);
 s.apiJson=async()=>({items:[],hasMore:false});await s.doTypedSearch('中文');assert.match(s.$results.innerHTML,/没有找到相关歌手/);assert.doesNotMatch(s.$results.innerHTML,/加载失败/);
});
test('mode switch cancels a queued input debounce before starting the new provider',()=>{
 const s=base();let timer,calls=0;Object.assign(s,{searchResultType:'song',searchInputComposing:false,setTimeout:cb=>(timer=cb,7),clearTimeout:()=>timer=null,isMusicSearchMode:()=>true,setSearchHistorySurface(){},searchTypeBarHtml:()=>'',escHtml:x=>x,updateSearchModeTabs(){},document:{getElementById:()=>null},doSearch:()=>calls++});
 load(s,['cancelPendingSearchTimer','abortActiveSearch','clearSearchResults','handleSearchInput','setSearchMode']);s.handleSearchInput({});assert(timer);s.setSearchMode('qq');assert.equal(timer,null);assert.equal(calls,1);
});
for (const settle of ['resolve','reject']) test(`old typed page cannot own a nested/back search after late ${settle}`,async()=>{
 const s=nested(),page=deferred(),detail=deferred();
 s.MUSIC_SEARCH_MAX_RESULTS=180;s.mergeTypedSearchItems=p=>Object.values(p).flat();
 s.typedSearchState.providerPages={netease:{nextOffset:18,hasMore:true}};
 s.apiJson=url=>url.includes('user-playlists')?detail.promise:page.promise;
 load(s,['searchProviderPagesHaveFailed','fetchTypedSearchProviderPage','loadNextTypedSearchPage']);
 const old=s.loadNextTypedSearchPage();const child=s.openTypedUserPlaylists({id:'u',name:'用户'});s.closeTypedUserPlaylists();
 const rows=s.typedSearchState.items,providerPage=s.typedSearchState.providerPages.netease,paints=s.renders.length;
 s.typedSearchState.loadingMore=true; // A newer load owns this bit.
 if(settle==='resolve')page.resolve({items:[{provider:'netease',id:'late'}],nextOffset:19,hasMore:false});else page.reject(new Error('late abort'));
 assert.equal(await old,false);assert.equal(s.typedSearchState.items,rows);assert.equal(s.typedSearchState.providerPages.netease,providerPage);assert.equal(s.typedSearchState.loadingMore,true);assert.equal(s.renders.length,paints);
 detail.resolve({playlists:[]});await child;
});
for (const settle of ['resolve','reject']) test(`outside dismissal stops late nested ${settle} and focus restarts interrupted query`,async()=>{
 const s=nested(),d=deferred();let signal;
 Object.assign(s,{searchNeedsRefresh:false,searchResultTypeLabel:()=> '用户',disconnectSearchLoadMoreObserver(){},setPeek(){},setSearchHistorySurface(){},searchTypeBarHtml:()=>'',escHtml:x=>x,setTimeout:cb=>(s.timer=cb,1)});
 s.apiJson=(_,o)=>{signal=o.signal;return d.promise;};load(s,['dismissSearchResults']);
 const pending=s.openTypedUserPlaylists({id:'u',name:'用户'});s.dismissSearchResults();const paints=s.renders.length;assert(signal.aborted);assert.equal(s.searchNeedsRefresh,true);
 if(settle==='resolve')d.resolve({playlists:[{id:'late'}]});else d.reject(new Error('offline'));await pending;assert.equal(s.renders.length,paints);
 s.$input.addEventListener=(_,cb)=>s.focus=cb;const start=source.indexOf("$input.addEventListener('focus',");vm.runInNewContext(source.slice(start,source.indexOf('\nvar searchBoxEl',start)),s);s.focus();assert.equal(s.searchNeedsRefresh,false);assert.equal(typeof s.timer,'function');assert.match(s.$results.innerHTML,/正在搜索/);
});
test('outside dismissal preserves completed rows and makes typed paging current on focus',()=>{
 const s=nested();Object.assign(s,{searchNeedsRefresh:false,disconnectSearchLoadMoreObserver(){}});load(s,['dismissSearchResults']);const old=s.typedSearchState,items=old.items;s.$results.innerHTML='cached';s.dismissSearchResults();assert.equal(s.searchNeedsRefresh,false);assert.equal(s.$results.innerHTML,'cached');assert.equal(s.typedSearchState.items,items);assert(s.typedSearchRequestIsCurrent(s.typedSearchState));assert.notEqual(s.typedSearchState,old);
});
test('completed songs ignore abandoned typed partial state when closing and refocusing',()=>{
 const s=nested();Object.assign(s,{searchNeedsRefresh:false,searchResultType:'song',searchLastResultQuery:'song|中文',disconnectSearchLoadMoreObserver(){},observeSearchLoadMoreSentinel(){},setPeek(){}});
 s.typedSearchState.partial=true;s.searchMusicRenderState={key:'song|中文',partial:false};s.$results.children=[{}];s.$results.innerHTML='completed songs';load(s,['dismissSearchResults']);s.dismissSearchResults();assert.equal(s.searchNeedsRefresh,false);
 s.handleSearchInput=()=>{throw new Error('completed cached songs must not refetch');};s.$input.addEventListener=(_,cb)=>s.focus=cb;const start=source.indexOf("$input.addEventListener('focus',");vm.runInNewContext(source.slice(start,source.indexOf('\nvar searchBoxEl',start)),s);s.focus();assert.equal(s.$results.innerHTML,'completed songs');
});
