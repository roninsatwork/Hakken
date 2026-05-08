const url = "https://witty-reindeer-300.convex.cloud/api/storage/kg23ejj5mzt7wmhrfb692jfw5x868201";
fetch(url).then(r=>r.json()).then(d => console.log(JSON.stringify(d).substring(0, 500)));
