const data = {
  lisbon: {
    title: 'Explore Lisbon.',
    copy: 'Choose how you would like to move through the city. Each format offers a different rhythm, while BLU shapes the perspective.',
    formats: ['By tuk tuk or private car', 'Walking tours', 'Private guided museum visits'],
    items: [
      {type:'city',tag:'Journeys in Cities',place:'Lisbon',title:'Lisbon in Perspective',desc:'Mapping the city’s evolution from medieval quarters to refined avenues: a foundation for your stay.',meta:'4–6 hours · Private car or tuk tuk',image:'/assets/explore-lisbon-layers.jpg',pdf:'/assets/lisbon-in-perspective.pdf',formats:[0]},
      {type:'city',tag:'Journeys in Cities',place:'Lisbon',title:'The Last Open Capital',desc:'A walk through wartime Lisbon and the stories of refugees, diplomats and intelligence officers who crossed paths here.',meta:'3 hours · Private walking tour',image:'/assets/portfolio-14.jpg',pdf:'/assets/the-last-open-capital.pdf',formats:[1]},
      {type:'city',tag:'Journeys in Cities',place:'Lisbon',title:'Historic Heart',desc:'Lisbon’s historic hills, Alfama and Graça, with a deeper visit to São Vicente in the Signature journey.',meta:'2½–4 hours · Private walking tour',image:'/assets/historic-heart-sao-vicente.jpg',pdf:'/assets/historic-heart-lisbon.pdf',formats:[1,2]},
      {type:'taste',tag:'Journeys of Craft & Table',place:'Lisbon',title:'Lisbon at the Table',desc:'Conservas, spices, Goan flavours and traditional shops reveal the people and connections that shaped Lisbon’s table.',meta:'Private walking tour · Light lunch tastings',image:'/assets/lisbon-at-the-table.webp',formats:[1]},
      {type:'city',tag:'Journeys in Cities',place:'Lisbon',title:'Lisbon for Young Explorers',desc:'Ships, gardens, maps and playful discovery—considered around children’s ages and the family’s pace.',meta:'Half or full day · Private',image:'/assets/portfolio-18.png',formats:[0]},
      {type:'time',tag:'Journeys in Time',place:'Belém · Lisbon',title:'The Age of Discoveries',desc:'Jerónimos, maritime history and Portugal’s relationship with the sea, placed in cultural context.',meta:'Afternoon · Private',image:'/assets/portfolio-48.jpg',pdf:'/assets/the-age-of-discoveries.pdf',formats:[0,2]}
    ]
  },
  sintra: {
    title: 'Explore Sintra & Cascais.',
    copy: 'Palaces, forest, symbols and coast—shaped as private day journeys from Lisbon, Cascais or Sintra.',
    formats: [],
    items: [
      {type:'land',tag:'Journeys on the Land',place:'Sintra',title:'Mysteries of Sintra',desc:'Pena Palace, the village and the symbolic world of Quinta da Regaleira.',meta:'Full day · Private',image:'/assets/explore-sintra-mysteries.png'},
      {type:'land',tag:'Journeys on the Land',place:'Sintra',title:'Sintra Through Kids’ Eyes',desc:'Forest paths, animals, stories and discovery shaped for families of different ages.',meta:'Full day · Private',image:'/assets/portfolio-26.png',pdf:'/assets/sintra-through-kids-eyes.pdf'},
      {type:'time',tag:'Journeys in Time',place:'Sintra',title:'The Art of Escape',desc:'Three perspectives on how we search for meaning, simplify and compose a life with intention.',meta:'Full day · Private',image:'/assets/art-of-escape-queluz.jpg',pdf:'/assets/the-art-of-escape-sintra.pdf'},
      {type:'water',tag:'Journeys by the Water',place:'Sintra & the Atlantic Coast',title:'Atlantic Road Arc',desc:'Óbidos, Ericeira and Sintra form the core route; longer journeys follow the western cliffs toward Cascais.',meta:'8–12 hours · Private',image:'/assets/atlantic-road-arc-ericeira.jpg',pdf:'/assets/atlantic-road-arc.pdf'}
    ]
  },
  central: {
    title: 'Explore Central Portugal.',
    copy: 'Medieval towns, monasteries, fortresses, devotion and the Atlantic—each journey with its own point of view.',
    formats: [],
    items: [
      {type:'water',tag:'Journeys by the Water',place:'Central Portugal',title:'From Land to Sea',desc:'Óbidos, Nazaré and the underground landscape of Mira de Aire.',meta:'Full day · From Lisbon',image:'/assets/explore-land-to-sea.png'},
      {type:'time',tag:'Journeys in Time',place:'Tagus Valley',title:'In the Templars’ Footsteps',desc:'Almourol, Tomar and the symbols preserved within the Convent of Christ.',meta:'Full day · From Lisbon',image:'/assets/portfolio-50.jpg'},
      {type:'time',tag:'Journeys in Time',place:'Central Portugal',title:'Paths of Faith',desc:'Fátima, Batalha, Alcobaça and Nazaré through devotion, architecture and story.',meta:'Full day · From Lisbon',image:'/assets/portfolio-52.jpg'}
    ]
  },
  alentejo: {
    title: 'Explore Arrábida & Alentejo.',
    copy: 'Meet Portugal through the materials, flavors and traditions carried by its landscapes and the people who work within them.',
    formats: [],
    items: [
      {type:'taste',tag:'Journeys of Craft & Table',place:'Arrábida',title:'Craft of the Arrábida Hills',desc:'Cheese making, azulejos and a six-generation winemaking legacy.',meta:'Day or multi-day · Private',image:'/assets/portfolio-40.png'},
      {type:'taste',tag:'Journeys of Craft & Table',place:'Alentejo',title:'Stories in Cork & Wine',desc:'Cork oak forests, clay amphorae and the hand-stitched traditions of Arraiolos.',meta:'Day or multi-day · Private',image:'/assets/portfolio-42.png',pdf:'/assets/stories-in-cork-and-wine.pdf'}
    ]
  },
  porto: {
    title: 'Explore Porto & the Douro.',
    copy: 'Choose how you would like to experience Porto, or move beyond the city into the estates and origins of northern Portugal.',
    formats: ['By private car', 'Walking tours', 'Private guided museum visits'],
    items: [
      {type:'city',tag:'Journeys in Cities',place:'Porto',title:'Porto in Layers',desc:'The city through history, wine, azulejos, food, writers and cafés.',meta:'Half or full day · Private',image:'/assets/explore-porto-layers.png',formats:[0,1,2]},
      {type:'taste',tag:'Journeys of Craft & Table',place:'Douro',title:'Estates of Vine & Olive',desc:'Family wineries, olive groves and a palace among the vineyards of the Douro.',meta:'Day or multi-day · Private',image:'/assets/explore-douro-vine-olive.png'},
      {type:'time',tag:'Journeys in Time',place:'Northern Portugal',title:'Origins of Portugal',desc:'Braga and Guimarães, where Roman foundations and the early kingdom meet.',meta:'Full day · From Porto',image:'/assets/explore-origins-portugal.jpg'}
    ]
  },
  between: {
    title: 'Journeys Between Regions.',
    copy: 'A transfer can be more than movement. BLU shapes the road between destinations as a coherent part of the journey.',
    formats: [],
    items: [
      {type:'water',tag:'Journeys by the Water',place:'Lisbon to Porto',title:'Between Lisbon and Porto',desc:'Óbidos, Vista Alegre and Aveiro create a meaningful route north.',meta:'Full travel day · Private',image:'/assets/portfolio-34.jpg'},
      {type:'taste',tag:'Journeys of Craft & Table',place:'Lisbon to the Algarve',title:'Through the Alentejo',desc:'The Sado, Roman remains, amphora wine and the open terrain of Alentejo.',meta:'Full travel day · Private',image:'/assets/explore-through-alentejo.png'}
    ]
  }
};

let current = 'lisbon';
let format = null;
let traveler = '';
const selected = new Set();
const q = selector => document.querySelector(selector);
const grid = q('#journey-grid');
const formatBox = q('#format-options');

function card(item) {
  const chosen = selected.has(item.title);
  const planUrl = `/plan-your-journey/?journey=${encodeURIComponent(item.title)}`;
  const discoverUrl = item.pdf || planUrl;
  const newTab = item.pdf ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<article class="journey ${item.type}"><div class="journey-photo"><img src="${item.image}" alt="${item.title}"><span class="journey-tag">${item.tag}</span><a href="${discoverUrl}"${newTab}>Discover ↗</a></div><p class="kicker">${item.place}</p><h3>${item.title}</h3><p>${item.desc}</p><p class="journey-meta">${item.meta}</p><div class="journey-actions"><a class="journey-link" href="${discoverUrl}"${newTab}>Discover the journey <span>↗</span></a><button class="add-journey ${chosen ? 'chosen' : ''}" data-name="${item.title}">${chosen ? '✓ Added to my plans' : '＋ Add to my plans'}</button></div></article>`;
}

function updatePlanButton() {
  q('#plan-count').textContent = selected.size;
  q('#my-plans').classList.toggle('show', selected.size > 0);
}

function render() {
  const destination = data[current];
  q('#place-title').textContent = destination.title;
  q('#place-copy').textContent = destination.copy;
  formatBox.innerHTML = '';
  q('#format-panel').style.display = destination.formats.length ? 'block' : 'none';
  destination.formats.forEach((name, index) => {
    const button = document.createElement('button');
    button.textContent = name;
    button.className = format === index ? 'active' : '';
    button.setAttribute('aria-pressed', String(format === index));
    button.onclick = () => { format = format === index ? null : index; render(); };
    formatBox.appendChild(button);
  });
  const items = destination.items.filter(item => format === null || !item.formats || item.formats.includes(format));
  q('#result-copy').textContent = `${items.length} considered ${items.length === 1 ? 'journey' : 'journeys'} for this selection`;
  grid.innerHTML = items.map(card).join('');
  document.querySelectorAll('.add-journey').forEach(button => button.onclick = () => toggleJourney(button.dataset.name));
}

function selectDestination(key, scroll = true) {
  current = key;
  format = null;
  document.querySelectorAll('[data-destination]').forEach(button => button.classList.toggle('active', button.dataset.destination === key));
  history.replaceState(null, '', `#${key}`);
  render();
  if (scroll) q('#selection').scrollIntoView({behavior:'smooth'});
}

function toggleJourney(name) {
  const added = !selected.has(name);
  added ? selected.add(name) : selected.delete(name);
  render();
  updatePlanButton();
  q('#toast').textContent = added ? `${name} added to your plans` : `${name} removed from your plans`;
  q('#toast').classList.add('show');
  setTimeout(() => q('#toast').classList.remove('show'), 1700);
}

document.querySelectorAll('[data-destination]').forEach(button => button.onclick = () => selectDestination(button.dataset.destination));
document.querySelectorAll('.route-trigger').forEach(button => button.onclick = () => selectDestination('between'));

const travelerDialog = q('#traveler-dialog');
q('#traveler-filter').onclick = () => travelerDialog.showModal();
travelerDialog.addEventListener('close', () => {
  if (travelerDialog.returnValue && travelerDialog.returnValue !== 'cancel') {
    traveler = travelerDialog.returnValue;
    q('#traveler-filter').innerHTML = `Traveling: ${traveler} ↗`;
  }
});

q('#my-plans').onclick = () => {
  const params = new URLSearchParams();
  params.set('journeys', [...selected].join(', '));
  if (traveler) params.set('travelers', traveler);
  location.href = `/plan-your-journey/?${params.toString()}`;
};

const initial = location.hash.slice(1);
if (data[initial]) selectDestination(initial, false); else render();
