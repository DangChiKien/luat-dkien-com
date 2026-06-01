const fs=require('fs'), path=require('path');
const ROOT='E:/Projects/luat-kien-com';
const laws=JSON.parse(fs.readFileSync(path.join(ROOT,'laws.json'),'utf8'));
const out=[];
for(const l of laws){
  const m=JSON.parse(fs.readFileSync(path.join(ROOT,l.slug,'manifest.json'),'utf8'));
  for(const a of m.articles){
    out.push({s:l.slug, c:l.code, n:l.name, d:String(a.dieu), t:a.title, f:a.file, k:a.keywords||''});
  }
}
fs.writeFileSync(path.join(ROOT,'search-index.json'), JSON.stringify(out));
console.log('search-index.json:', out.length, 'articles,', (fs.statSync(path.join(ROOT,'search-index.json')).size/1024).toFixed(0)+'KB');
