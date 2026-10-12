/**
 * The places a search or a page can name (Anthony, 12 October 2026, on which
 * page should own a search: "location, keyword volume and other factors all
 * make this up"): "web design london" names London, /web-design-surrey/ is
 * Surrey's page, and a town is in its county, so "web design guildford" is a
 * Surrey search. Read from the words alone, nothing bought.
 *
 * Kept by hand, the United Kingdom fullest — its counties, each with its
 * cities and towns, and London with its boroughs and districts — then the
 * world's countries, its bigger cities, the American states and Italy's
 * regions and cities in both languages. A name that is also an everyday word
 * is left out ("reading", "deal", "barking", "down"), so an article's
 * "further reading" is never a town. A place not here is simply not read as
 * one: the search is then weighed as naming no place.
 */

/** Each UK county or region, then its cities and towns. A city that is its own county has none. */
const UK = [
  "london: greater london, city of london, central london, north london, south london, east london, west london, westminster, camden, islington, hackney, shoreditch, soho, mayfair, covent garden, holborn, clerkenwell, farringdon, kings cross, fitzrovia, marylebone, paddington, kensington, chelsea, fulham, hammersmith, chiswick, ealing, acton, hounslow, twickenham, richmond, kingston, kingston upon thames, wimbledon, merton, sutton, croydon, bromley, bexley, greenwich, lewisham, southwark, bermondsey, lambeth, brixton, clapham, battersea, wandsworth, putney, tower hamlets, canary wharf, docklands, whitechapel, stratford, newham, redbridge, ilford, romford, havering, enfield, barnet, harrow, hillingdon, uxbridge, brent, wembley, haringey, tottenham, walthamstow",
  "england",
  "scotland",
  "wales",
  "northern ireland",
  "surrey: guildford, woking, epsom, ewell, reigate, redhill, dorking, farnham, godalming, camberley, leatherhead, weybridge, staines, egham, cobham, esher, walton on thames, oxted, caterham, haslemere, cranleigh, banstead, chertsey, addlestone, frimley",
  "kent: maidstone, canterbury, tunbridge wells, royal tunbridge wells, sevenoaks, ashford, dartford, gravesend, chatham, rochester, gillingham, medway, folkestone, dover, margate, ramsgate, broadstairs, whitstable, herne bay, tonbridge, faversham, sittingbourne",
  "sussex: east sussex, west sussex, brighton, hove, brighton and hove, crawley, horsham, chichester, worthing, eastbourne, hastings, bognor regis, burgess hill, haywards heath, east grinstead, lewes, littlehampton, shoreham, bexhill",
  "hampshire: southampton, portsmouth, winchester, basingstoke, farnborough, aldershot, fareham, andover, eastleigh, havant, gosport, petersfield, alton, romsey, lymington, new forest",
  "berkshire: slough, windsor, maidenhead, bracknell, wokingham, newbury, ascot, thatcham, sandhurst",
  "buckinghamshire: milton keynes, high wycombe, aylesbury, marlow, beaconsfield, amersham, chesham, gerrards cross, buckingham",
  "oxfordshire: oxford, banbury, bicester, abingdon, didcot, witney, henley, henley on thames, wantage, thame",
  "hertfordshire: watford, st albans, hertford, stevenage, hemel hempstead, harpenden, welwyn, welwyn garden city, hatfield, hitchin, letchworth, bishops stortford, berkhamsted, borehamwood, rickmansworth, tring",
  "essex: chelmsford, colchester, southend, southend on sea, basildon, brentwood, harlow, braintree, billericay, epping, loughton, thurrock, clacton, saffron walden",
  "bedfordshire: bedford, luton, dunstable, leighton buzzard",
  "cambridgeshire: cambridge, peterborough, ely, huntingdon, st neots, st ives, wisbech",
  "norfolk: norwich, kings lynn, great yarmouth, thetford, cromer",
  "suffolk: ipswich, bury st edmunds, lowestoft, felixstowe, sudbury, newmarket",
  "northamptonshire: northampton, kettering, corby, wellingborough, daventry",
  "leicestershire: leicester, loughborough, hinckley, market harborough, melton mowbray",
  "rutland: oakham",
  "lincolnshire: lincoln, grimsby, scunthorpe, boston, grantham, skegness, spalding, stamford",
  "nottinghamshire: nottingham, mansfield, newark, worksop",
  "derbyshire: derby, chesterfield, buxton, matlock, ilkeston",
  "warwickshire: warwick, leamington, leamington spa, royal leamington spa, nuneaton, stratford upon avon, kenilworth",
  "west midlands: birmingham, coventry, wolverhampton, solihull, walsall, dudley, west bromwich, sutton coldfield",
  "staffordshire: stafford, stoke, stoke on trent, burton upon trent, lichfield, tamworth, cannock, newcastle under lyme",
  "shropshire: shrewsbury, telford, oswestry, ludlow",
  "worcestershire: worcester, redditch, kidderminster, bromsgrove, malvern, evesham",
  "herefordshire: hereford, leominster",
  "gloucestershire: gloucester, cheltenham, stroud, tewkesbury, cirencester, cotswolds",
  "bristol",
  "somerset: bath, taunton, yeovil, weston super mare, bridgwater, frome, glastonbury",
  "wiltshire: swindon, salisbury, chippenham, trowbridge, devizes, marlborough",
  "dorset: bournemouth, poole, dorchester, weymouth, christchurch",
  "devon: exeter, plymouth, torquay, paignton, torbay, barnstaple, exmouth, newton abbot",
  "cornwall: truro, newquay, falmouth, penzance, st austell, bodmin",
  "isle of wight: newport iow, ryde, cowes",
  "cheshire: chester, warrington, crewe, macclesfield, northwich, wilmslow, knutsford, nantwich, ellesmere port, runcorn, widnes",
  "greater manchester: manchester, salford, stockport, bolton, wigan, oldham, rochdale, trafford, altrincham, sale moor, ashton under lyne",
  "merseyside: liverpool, birkenhead, southport, st helens, wirral, bootle",
  "lancashire: preston, lancaster, blackpool, blackburn, burnley, chorley, lytham, accrington",
  "cumbria: carlisle, kendal, barrow in furness, penrith, workington, lake district",
  "yorkshire: north yorkshire, south yorkshire, west yorkshire, east yorkshire, east riding of yorkshire, leeds, sheffield, bradford, york, hull, kingston upon hull, huddersfield, wakefield, doncaster, rotherham, barnsley, halifax, harrogate, scarborough, middlesbrough, dewsbury, keighley, ilkley, selby, beverley",
  "durham: county durham, darlington, hartlepool, stockton, stockton on tees, teesside",
  "northumberland: hexham, morpeth, alnwick, cramlington",
  "tyne and wear: newcastle, newcastle upon tyne, sunderland, gateshead, south shields, north shields, tynemouth",
  "midlands: east midlands, west midlands",
  "east anglia",
  "home counties",
  "thames valley",
  "north east",
  "north west",
  "south east",
  "south west",
  "glasgow",
  "edinburgh",
  "lothian: livingston, east lothian, west lothian, midlothian",
  "aberdeenshire: aberdeen, peterhead, inverurie",
  "dundee",
  "fife: dunfermline, kirkcaldy, st andrews, glenrothes",
  "highlands: inverness, fort william, scottish highlands",
  "stirling: falkirk",
  "perthshire: perth",
  "ayrshire: ayr, kilmarnock, irvine",
  "lanarkshire: hamilton, east kilbride, motherwell, airdrie, coatbridge",
  "renfrewshire: paisley",
  "dumfries and galloway: dumfries",
  "scottish borders: galashiels",
  "moray: elgin",
  "cardiff",
  "swansea",
  "newport",
  "glamorgan: vale of glamorgan, bridgend, merthyr tydfil, pontypridd, caerphilly, neath, port talbot",
  "gwent: monmouthshire, monmouth, cwmbran, abergavenny, chepstow",
  "carmarthenshire: carmarthen, llanelli",
  "pembrokeshire: haverfordwest, pembroke, tenby",
  "ceredigion: aberystwyth",
  "powys: brecon, newtown, welshpool",
  "gwynedd: bangor, caernarfon, snowdonia",
  "anglesey: holyhead",
  "conwy: llandudno, colwyn bay",
  "denbighshire: rhyl, denbigh",
  "flintshire: buckley, connahs quay",
  "wrexham",
  "belfast",
  "antrim: county antrim, lisburn, ballymena, newtownabbey",
  "armagh: county armagh, craigavon, portadown",
  "derry: londonderry, county londonderry, coleraine",
  "county down: newry, bangor ni, newtownards",
  "fermanagh: enniskillen",
  "tyrone: county tyrone, omagh, dungannon",
  "channel islands: st helier, st peter port",
  "isle of man: douglas iom",
];

/** Bigger cities and regions beyond the UK, Italy's in both languages, and the American states. */
const WORLD = [
  "dublin", "cork", "galway", "limerick", "paris", "lyon", "marseille", "berlin", "munich", "hamburg", "frankfurt", "cologne", "dusseldorf", "stuttgart",
  "amsterdam", "rotterdam", "the hague", "brussels", "antwerp", "luxembourg city", "zurich", "geneva", "basel", "vienna", "madrid", "barcelona", "valencia", "seville", "malaga",
  "lisbon", "porto", "copenhagen", "stockholm", "gothenburg", "oslo", "helsinki", "reykjavik", "warsaw", "krakow", "prague", "budapest", "bucharest", "sofia", "athens",
  "istanbul", "ankara", "moscow", "kyiv", "kiev", "tallinn", "riga", "vilnius", "belgrade", "zagreb", "ljubljana",
  "rome: roma, lazio", "milan: milano, lombardy, lombardia", "naples: napoli, campania", "turin: torino, piedmont, piemonte", "florence: firenze, tuscany, toscana",
  "venice: venezia, veneto, verona, padua, padova", "genoa: genova, liguria", "bologna: emilia romagna", "palermo: sicily, sicilia, catania", "bari: puglia, apulia", "cagliari: sardinia, sardegna",
  "dubai", "abu dhabi", "sharjah", "ajman", "doha", "riyadh", "jeddah", "dammam", "mecca", "medina", "kuwait city", "manama", "muscat", "baghdad", "erbil", "basra", "amman", "beirut", "tel aviv", "jerusalem", "cairo", "alexandria",
  "lagos", "abuja", "nairobi", "johannesburg", "cape town", "durban", "casablanca", "marrakech", "tunis", "accra",
  "mumbai", "delhi", "new delhi", "bangalore", "bengaluru", "hyderabad", "chennai", "kolkata", "pune", "karachi", "lahore", "islamabad", "dhaka", "colombo", "kathmandu",
  "singapore", "kuala lumpur", "bangkok", "jakarta", "manila", "ho chi minh city", "hanoi", "hong kong", "macau", "shanghai", "beijing", "shenzhen", "guangzhou", "taipei", "seoul", "tokyo", "osaka", "kyoto",
  "sydney", "melbourne", "brisbane", "perth wa", "adelaide", "canberra", "auckland", "wellington", "christchurch nz",
  "new york: new york city, nyc, manhattan, brooklyn", "los angeles", "san francisco", "san diego", "san jose", "silicon valley", "seattle", "portland", "chicago", "boston", "washington dc", "miami", "orlando", "tampa",
  "atlanta", "dallas", "houston", "austin", "san antonio", "denver", "phoenix", "las vegas", "philadelphia", "detroit", "minneapolis", "nashville", "charlotte", "new orleans", "salt lake city",
  "toronto", "montreal", "vancouver", "calgary", "ottawa", "edmonton", "mexico city", "sao paulo", "rio de janeiro", "buenos aires", "santiago", "lima", "bogota",
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky",
  "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico",
  "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont", "virginia",
  "washington state", "west virginia", "wisconsin", "wyoming",
];

/** The world's countries by their ISO code, with the other names a search uses for them. */
const COUNTRIES: Record<string, string> = {
  GB: "united kingdom, uk, u k, britain, great britain, british, gb", US: "united states, usa, u s a, america, american", AE: "united arab emirates, uae, emirates", SA: "saudi arabia, saudi, ksa",
  IQ: "iraq, kurdistan", IE: "ireland, eire", IT: "italy, italia", FR: "france", DE: "germany, deutschland", ES: "spain, espana", PT: "portugal", NL: "netherlands, holland", BE: "belgium", CH: "switzerland",
  AT: "austria", DK: "denmark", SE: "sweden", NO: "norway", FI: "finland", IS: "iceland", PL: "poland", CZ: "czechia, czech republic", SK: "slovakia", HU: "hungary", RO: "romania", BG: "bulgaria",
  GR: "greece", CY: "cyprus", MT: "malta", HR: "croatia", SI: "slovenia", RS: "serbia", BA: "bosnia, bosnia and herzegovina", ME: "montenegro", MK: "north macedonia", AL: "albania", EE: "estonia",
  LV: "latvia", LT: "lithuania", UA: "ukraine", BY: "belarus", MD: "moldova", RU: "russia", TR: "turkey, turkiye", GE: "georgia", AM: "armenia", AZ: "azerbaijan", LU: "luxembourg", MC: "monaco",
  QA: "qatar", KW: "kuwait", BH: "bahrain", OM: "oman", JO: "jordan", LB: "lebanon", SY: "syria", IL: "israel", PS: "palestine", EG: "egypt", IR: "iran", YE: "yemen",
  MA: "morocco", DZ: "algeria", TN: "tunisia", LY: "libya", NG: "nigeria", GH: "ghana", KE: "kenya", ZA: "south africa", ET: "ethiopia", TZ: "tanzania", UG: "uganda", RW: "rwanda", ZW: "zimbabwe",
  ZM: "zambia", BW: "botswana", NA: "namibia", MU: "mauritius", SN: "senegal", CI: "ivory coast, cote d ivoire", CM: "cameroon", IN: "india", PK: "pakistan", BD: "bangladesh", LK: "sri lanka",
  NP: "nepal", AF: "afghanistan", KZ: "kazakhstan", UZ: "uzbekistan", CN: "china", JP: "japan", KR: "south korea, korea", TW: "taiwan", HK: "hong kong", SG: "singapore", MY: "malaysia",
  TH: "thailand", VN: "vietnam", ID: "indonesia", PH: "philippines", MM: "myanmar, burma", KH: "cambodia", AU: "australia", NZ: "new zealand", CA: "canada", MX: "mexico", BR: "brazil",
  AR: "argentina", CL: "chile", CO: "colombia", PE: "peru", VE: "venezuela", EC: "ecuador", UY: "uruguay", PY: "paraguay", BO: "bolivia", CR: "costa rica", PA: "panama", JM: "jamaica",
  TT: "trinidad, trinidad and tobago", BB: "barbados", BS: "bahamas", DO: "dominican republic", CU: "cuba", PR: "puerto rico", GI: "gibraltar",
};

/** Words that mean "where I am": the place is wherever the business has an office. */
const NEAR = ["near me", "nearby", "near by", "close to me", "around me", "closest"];
/** Words that name the whole country, whichever it is. */
const NATIONWIDE = ["nationwide", "nationally", "national"];

const MOST_WORDS = 5;

/** A text's words, lower case and without accents or marks: "St. Albans" is "st albans". */
export function wordsOf(text: string): string[] {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean)
    .map((word) => (word === "saint" ? "st" : word));
}

/** Each place by its name, with the county or region it is in, if any. */
const PLACES = new Map<string, string | null>();
for (const line of [...UK, ...WORLD]) {
  const [head, rest] = line.split(":");
  const county = head.trim();
  PLACES.set(county, null);
  for (const town of (rest ?? "").split(",").map((name) => name.trim()).filter(Boolean)) PLACES.set(town, county);
}
const COUNTRY_NAMES = new Map<string, string>();
for (const [iso, names] of Object.entries(COUNTRIES)) for (const name of names.split(",").map((entry) => entry.trim())) COUNTRY_NAMES.set(name, iso);

/** What a search or a page names: its places (each with its county), whether it means "near me", and whether it names only the country. */
export type Named = { places: string[]; near: boolean; country: boolean };

/**
 * The places in a text, the longest name first ("west sussex", not
 * "sussex"), each followed by the county it is in; a country is a place
 * unless it is the website's own (`homeIso`), which names no one place.
 */
export function namedIn(text: string, homeIso: string | null): Named {
  const words = wordsOf(text);
  const joined = ` ${words.join(" ")} `;
  const places: string[] = [];
  let country = NATIONWIDE.some((word) => joined.includes(` ${word} `));
  for (let at = 0; at < words.length; at += 1) {
    for (let size = Math.min(MOST_WORDS, words.length - at); size >= 1; size -= 1) {
      const name = words.slice(at, at + size).join(" ");
      const iso = COUNTRY_NAMES.get(name);
      if (iso !== undefined && iso === homeIso) {
        country = true;
        at += size - 1;
        break;
      }
      const place = PLACES.has(name) ? name : iso !== undefined ? name : null;
      if (!place) continue;
      if (!places.includes(place)) places.push(place);
      const county = PLACES.get(place);
      if (county && !places.includes(county)) places.push(county);
      at += size - 1;
      break;
    }
  }
  return { places, near: NEAR.some((word) => joined.includes(` ${word} `)), country };
}

/** A place as a client reads it: "west sussex" is "West Sussex", "uk" is "UK". */
export function placeName(place: string): string {
  return place.split(" ").map((word) => (word.length <= 3 && /^(uk|usa|uae|ksa|nyc|dc|iow|iom|ni|nz|wa)$/.test(word) ? word.toUpperCase() : word === "and" || word === "of" || word === "upon" || word === "on" || word === "under" ? word : word[0].toUpperCase() + word.slice(1))).join(" ");
}
