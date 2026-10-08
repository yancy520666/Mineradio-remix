'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
const start=source.indexOf('async function fetchNeteaseUserPlaylistsPage('),end=source.indexOf('\n}\n',start);
async function page(body,offset=0){const c={NETEASE_PLAYLIST_SYNC_PAGE_SIZE:200,userCookie:'fixture',user_playlist:async()=>({body})};vm.createContext(c);vm.runInContext(source.slice(start,end+3),c);return c.fetchNeteaseUserPlaylistsPage('fixture',2,offset);}
test('NetEase honors upstream more when total is absent and ends on the last page',async()=>{
 let r=await page({code:200,playlist:[{id:1},{id:2}],more:true});assert.equal(r.hasMore,true);assert.equal(r.totalKnown,false);
 r=await page({code:200,playlist:[{id:3}],more:false},2);assert.equal(r.hasMore,false);assert.equal(r.nextOffset,3);
 r=await page({code:200,playlist:[{id:1}],total:1});assert.equal(r.hasMore,false);assert.equal(r.totalKnown,true);
 await assert.rejects(page({code:405,playlist:[]}),/NETEASE_PLAYLIST_PAGE_FAILED/);
});
