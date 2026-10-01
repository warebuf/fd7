// Shared card data + deck helpers for fd7 (index.html game + decks.html builder).

// League-style unit stats:
//   hp     health
//   ad     attack damage — auto-attacks deal this as physical damage
//   ap     ability power — Medic heals for this
//   armor  reduces physical damage, mr (magic resist) reduces magic damage: taken = dmg × 100 / (100 + resist)
//   as     attack speed — actions per second, one second being TICKS_PER_SECOND ticks (0 = never acts)
// Every unit has three abilities, one per board slot (1–3, left to right) — see `positions`, and
// POSITION_ACTIONS in index.html for how they resolve. acts:false means it never acts on its own in that slot.
var TICKS_PER_SECOND = 10;

var CARD_DEFS = {
  striker:   { key:'striker',   name:'Striker',   icon:'⚔', role:'attacker', hp:20, ad:10, ap:0,  armor:20, mr:10, as:0.5,
    effect:'Its ability depends on where it stands: front, middle or back.',
    positions:[
      { name:'Heavy attack', short:'HEAVY', text:'Hits a random enemy for 150% of its AD.' },
      { name:'Buff itself',  short:'RAMP',  text:'Permanently gains +5 AD.' },
      { name:'Execute',      short:'EXECUTE', text:'Attack the most damaged enemy (lowest HP %) for 100% AD.' }
    ] },
  medic:     { key:'medic',     name:'Medic',     icon:'✚', role:'healer',   hp:15, ad:0,  ap:10, armor:10, mr:25, as:0.5,
    effect:'Its ability depends on where it stands: front, middle or back.',
    positions:[
      { name:'Heal',    short:'HEAL',    text:'Heals your weakest ally for 100% AP.' },
      { name:'AD buff', short:'+AD', text:'Gives every friendly on-field unit +3 AD permanently.' },
      { name:'Heal',    short:'HEAL',    text:'Heals your weakest ally for 100% AP.' }
    ] },
  predator:  { key:'predator',  name:'Predator',  icon:'♦', role:'attacker', hp:18, ad:16, ap:0,  armor:15, mr:10, as:0.5,
    effect:'Its ability depends on where it stands: front, middle or back.',
    positions:[
      { name:'No ability', short:'—', acts:false, text:'No ability.' },
      { name:'No ability', short:'—', acts:false, text:'No ability.' },
      { name:'Trophy', short:'TROPHY', text:'Attacks the front line. Every kill permanently gives this card +2 AD for the rest of the game.' }
    ] },
  warden:      { key:'warden',      name:'Warden',      icon:'⛉', role:'support',  hp:20, ad:0,  ap:0,  armor:30, mr:30, as:0.5,
    effect:'Its ability depends on where it stands: front, middle or back.',
    positions:[
      { name:'Guard',   short:'GUARD',   text:'Guards your weakest other ally: attacks aimed at it hit Warden instead, until Warden acts again.' },
      { name:'Guard',   short:'GUARD',   text:'Guards your weakest other ally: attacks aimed at it hit Warden instead, until Warden acts again.' },
      { name:'Fortify', short:'FORTIFY', text:'Gives every unit on your side +5 armor permanently (kept for the rest of the game). Stacks.' }
    ] },
  saboteur:  { key:'saboteur',  name:'Saboteur',  icon:'⚙', role:'support',  hp:16, ad:0,  ap:0,  armor:15, mr:15, as:0.5,
    effect:'Its ability depends on where it stands: front, middle or back.',
    positions:[
      { name:'Sabotage',   short:'DELAY', text:'Delays the next enemy to act by 5 ticks.' },
      { name:'No ability', short:'—',     acts:false, text:'No ability.' },
      { name:'Steal',      short:'STEAL', text:'Steals 10% of a random stat from a random enemy, permanently.' }
    ] }
};
// The battle runs on ticks, so each unit's attack speed becomes a cooldown in ticks (AS 0.5 → every 20 ticks).
Object.keys(CARD_DEFS).forEach(function(k){
  var c = CARD_DEFS[k];
  c.cooldown = c.as > 0 ? Math.round(TICKS_PER_SECOND / c.as) : Infinity;
});

var DECK_SIZE = 9;   // every deck is exactly this many cards
var DEFAULT_RECIPE = { striker:2, medic:2, predator:2, warden:2, saboteur:1 };
var MAX_COPIES = 6;
// The three board slots, left to right. Front is where attacks land by default.
var SLOT_NAMES = ['Front', 'Middle', 'Back'];
var ROUND_PICKS = 3;   // once fewer than this many cards are left in a deck, the discard pile returns to it
var DECK_STORAGE_KEY = 'fd7-deck-recipes';

function el(tag, cls, attrs){
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function roleLabel(card){
  return { attacker:'Attacker', healer:'Healer', support:'Support' }[card.role];
}

// ['HP 20', 'AD 10', 'AP 0', 'ARM 20', 'MR 10', 'AS 0.50'], including permanent bonuses (or losses) earned in play.
function statList(card){
  return ['HP ' + (card.hp + (card.bonusHp || 0)), 'AD ' + (card.ad + (card.bonusAd || 0)), 'AP ' + (card.ap + (card.bonusAp || 0)),
          'ARM ' + (card.armor + (card.bonusArmor || 0)), 'MR ' + (card.mr + (card.bonusMr || 0)),
          'AS ' + (card.as > 0 ? card.as.toFixed(2) : '—')];
}

// Title, stat pills and effect text for a "Card Info" panel. Lists the front/middle/back abilities and highlights
// the one for activeSlot (0–2) when the card is on the board.
function cardInfoHtml(card, activeSlot){
  var effect = card.positions
    ? '<div class="pos-list">' + card.positions.map(function(pos, i){
        return '<div class="pos-item' + (i === activeSlot ? ' active' : '') + '"><span class="pos-name">' + SLOT_NAMES[i] + '</span>' +
          '<div><b>' + pos.name + '</b> — ' + pos.text + '</div></div>';
      }).join('') + '</div>'
    : '<div class="inspector-effect">' + card.effect + '</div>';
  return '<div class="inspector-title"><div class="inspector-icon">' + card.icon + '</div>' +
    '<div><div class="inspector-name">' + card.name + '</div><div class="inspector-role">' + roleLabel(card) +
    (card.positions ? ' · ability by slot' : '') + '</div></div></div>' +
    '<div class="inspector-stats">' + statList(card).map(function(t){ return '<span class="stat-pill mono">' + t + '</span>'; }).join('') + '</div>' +
    effect;
}

// ---------- Deck recipes: { cardKey: copies }, one per player, kept in localStorage ----------
function emptyRecipe(){
  var r = {};
  Object.keys(CARD_DEFS).forEach(function(k){ r[k] = 0; });
  return r;
}
function defaultRecipe(){
  var r = emptyRecipe();
  Object.keys(DEFAULT_RECIPE).forEach(function(k){ r[k] = DEFAULT_RECIPE[k]; });
  return r;
}
function deckTotal(recipe){
  return Object.keys(recipe).reduce(function(a, k){ return a + recipe[k]; }, 0);
}
function sanitizeRecipe(saved){
  var r = emptyRecipe();
  if (saved) Object.keys(r).forEach(function(k){
    if (typeof saved[k] === 'number') r[k] = Math.max(0, Math.min(MAX_COPIES, Math.round(saved[k])));
  });
  return r;
}
function loadDeckRecipes(){
  try {
    var parsed = JSON.parse(localStorage.getItem(DECK_STORAGE_KEY));
    // a saved deck that isn't exactly DECK_SIZE cards (e.g. from before the size rule) falls back to the default
    if (Array.isArray(parsed) && parsed.length === 2) return parsed.map(function(saved){
      var r = sanitizeRecipe(saved);
      return deckTotal(r) === DECK_SIZE ? r : defaultRecipe();
    });
  } catch (e){}
  return [defaultRecipe(), defaultRecipe()];
}
function saveDeckRecipes(recipes){
  try { localStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(recipes)); } catch (e){}
}
