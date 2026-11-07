const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict');
const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/api/markets.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
let payload,requested;const api={};class ApiError extends Error{}
new Function('require','exports',source)(()=>({ApiError,getJson:async url=>{requested=url;return payload;}}),api);
const location={latitude:37.55,longitude:126.91,radius:1,name:'테스트'};
const market={market_id:1,market_name:'시장',address:'주소',latitude:37.55,longitude:126.91,distance:350,image_url:null};
(async()=>{
 const items=[{...market,market_id:null,market_name:'동명시장',distance:100},{...market,market_id:null,market_name:'동명시장',address:'다른 주소',distance:200},market,{...market,distance:400},{...market,market_id:2,image_url:'https://example.com/market.jpg',distance:50},{...market,market_id:3,distance:2000}];
 payload={markets:items};const result=await api.getNearbyMarkets(location);assert.deepEqual(result.map(m=>m.market_id),[2,null,null,1]);assert.equal(result[1].image_url,null);assert.equal(items.length,6);const query=new URL(requested,'https://test.invalid').searchParams;assert.equal(query.get('radius'),'1000');assert.equal(query.get('latitude'),'37.55');
 for(const id of [undefined,'1',0,-1,1.5]){payload={markets:[{...market,market_id:id}]};await assert.rejects(()=>api.getNearbyMarkets(location),/응답/);}
 for(const image of [undefined,1,{}]){payload={markets:[{...market,image_url:image}]};await assert.rejects(()=>api.getNearbyMarkets(location),/응답/);}
 for(const change of [{latitude:100},{longitude:190},{distance:-1},{market_name:null}]){payload={markets:[{...market,...change}]};await assert.rejects(()=>api.getNearbyMarkets(location),/응답/);}
 payload={markets:[]};assert.deepEqual(await api.getNearbyMarkets(location),[]);
 console.log('PASS: nullable IDs/images, distinct unregistered markets, registered deduplication, radius filtering/sorting, required fields and invalid values');
})().catch(e=>{console.error(e);process.exitCode=1;});
