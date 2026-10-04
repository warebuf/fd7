// Shared card data + deck helpers for fd7 (index.html game + decks.html builder).

// League-style unit stats:
//   hp     health
//   ad     attack damage — auto-attacks deal this as physical damage
//   ap     ability power — Medic heals for this
//   armor  reduces physical damage, mr (magic resist) reduces magic damage: taken = dmg × 100 / (100 + resist)
//   as     attack speed — actions per second, one second being TICKS_PER_SECOND ticks (0 = never acts)
// A card or ability may have an energy `cost` (default 0: free) — see Energy in index.html.
// Every unit has a list of `abilities`; each round its owner picks which one it uses (ids resolve in ABILITIES in
// index.html). An ability with `lines` can only be used from slots on those lines ('front', 'middle', 'back');
// a `passive` one is never acted out — it works just by the unit being on the board (Warden's Taunt).
// Board slots also matter for targeting (attacks land on the frontmost unit) and turn order.
var TICKS_PER_SECOND = 10;

var CARD_DEFS = {
  striker:   { key:'striker',   name:'Striker',   icon:'⚔', role:'attacker', hp:30, ad:10, ap:0,  armor:15, mr:10, as:0.5,
    abilities:[
      { id:'heavy',   name:'Heavy attack', short:'HEAVY',   text:'Hits a random enemy for 150% of its AD.' },
      { id:'breach',  name:'Breach',       short:'BREACH',  cost:2, text:'Its next attack hits the frontmost enemy and the unit behind it.' },
      { id:'execute', name:'Execute',      short:'EXECUTE', text:'Attack the most damaged enemy (lowest HP %) for 100% AD.' }
    ] },
  medic:     { key:'medic',     name:'Medic',     icon:'✚', role:'healer',   hp:50, ad:0,  ap:10, armor:5, mr:25, as:1,
    abilities:[
      { id:'heal',   name:'Heal',    short:'HEAL', text:'Heals your weakest ally for 100% AP.' },
      { id:'adbuff', name:'AD buff', short:'+AD',  text:'Gives every friendly on-field unit +3 AD permanently.' },
      { id:'revive', name:'Revive',  short:'REVIVE', cost:4, text:'Return a defeated ally at half HP with zero charge.' }
    ] },
  predator:  { key:'predator',  name:'Predator',  icon:'♦', role:'attacker', hp:30, ad:14, ap:0,  armor:10, mr:10, as:0.5,
    abilities:[
      { id:'trophy', name:'Trophy', short:'TROPHY', lines:['back'], text:'Attack the frontmost enemy for 100% AD. If this ability kills the target, permanently gain +2 AD.' },
      { id:'flank',  name:'Flank',  short:'FLANK',  text:'Attacks the backmost enemy for 50% AD.' }
    ] },
  warden:    { key:'warden',    name:'Warden',    icon:'⛉', role:'support',  hp:40, ad:0,  ap:0,  armor:40, mr:30, as:0.5,
    abilities:[
      { id:'taunt', name:'Taunt', short:'TAUNT', passive:true, text:'Never acts. While Warden lives, every enemy attack must target it.' }
    ] },
  saboteur:  { key:'saboteur',  name:'Saboteur',  icon:'⚙', role:'support',  hp:32, ad:0,  ap:0,  armor:15, mr:15, as:0.5,
    abilities:[
      { id:'sabotage', name:'Sabotage', short:'DELAY', text:'Delays the next enemy to act by 5 ticks.' },
      { id:'steal',    name:'Steal',    short:'STEAL', lines:['back'], text:'Steals 10% of a random stat from a random enemy, permanently.' }
    ] },
  generator: { key:'generator', name:'Generator', icon:'⚡', role:'support',  hp:30, ad:0,  ap:0,  armor:15, mr:15, as:0.1,
    abilities:[
      { id:'generate', name:'Generate', short:'+1 ⚡', text:'Takes 100 ticks to charge. Gives you 1 energy.' }
    ] },
  chronomancer: { key:'chronomancer', name:'Chronomancer', icon:'⧗', role:'support', hp:30, ad:0, ap:0, armor:15, mr:20, as:0.4,
    abilities:[
      { id:'timewarp', name:'Time Warp', short:'WARP', cost:3, text:'Gives all ally units full charge: each acts right away, then charges again from empty.' }
    ] },
  dynamo:    { key:'dynamo',    name:'Dynamo',    icon:'✷', role:'attacker', hp:30, ad:10, ap:0,  armor:15, mr:10, as:0.5,
    abilities:[
      { id:'empower', name:'Empower', short:'EMPOWER', cost:1, text:'Spend 1 energy to gain +5 AD for the round.' },
      { id:'strike',  name:'Strike',  short:'STRIKE',  text:'Attack for 100% AD.' }
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
// The board slots by index, front to back: two front-line slots, one middle, one back. Attacks land on the
// frontmost unit by default. On screen each side's front faces the middle, so the left player's board is drawn
// back to front.
var SLOT_NAMES = ['Front', 'Front', 'Middle', 'Back'];
var SLOT_LINES = ['front', 'front', 'middle', 'back'];
var HAND_SIZE = 5;   // each round you draw this many cards and field up to one per board slot
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

function findAbility(card, id){
  return card.abilities.filter(function(a){ return a.id === id; })[0] || card.abilities[0];
}
// Can this ability be used from board slot `slot`? (slot undefined = not on the board: no restriction.)
function abilityAllowed(ab, slot){ return slot == null || !ab.lines || ab.lines.indexOf(SLOT_LINES[slot]) !== -1; }
function allowedAbilities(card, slot){ return card.abilities.filter(function(ab){ return abilityAllowed(ab, slot); }); }
// "Back only", for abilities restricted to certain lines; '' otherwise.
function slotRestriction(ab){
  return ab.lines ? ab.lines.map(function(l){ return l.charAt(0).toUpperCase() + l.slice(1); }).join('/') + ' only' : '';
}

// Title, stat pills and abilities for a "Card Info" panel. activeId highlights the ability the unit is using;
// pickable makes each ability usable from `slot` clickable (data-ability) so it can be switched (setup, or a
// paused battle). Abilities that can't be used from `slot` are greyed out.
function cardInfoHtml(card, activeId, pickable, slot){
  var effect = '<div class="pos-list">' + card.abilities.map(function(ab){
    var ok = abilityAllowed(ab, slot), limit = slotRestriction(ab);
    return '<div class="pos-item' + (ab.id === activeId ? ' active' : '') + (ok ? '' : ' unavailable') +
      (pickable && ok ? ' pickable" data-ability="' + ab.id + '" role="button" tabindex="0' : '') + '">' +
      '<div><b>' + ab.name + '</b>' + (ab.cost ? ' <span class="pos-limit">⚡' + ab.cost + '</span>' : '') +
      (limit ? ' <span class="pos-limit">' + limit + '</span>' : '') + ' — ' + ab.text + '</div></div>';
  }).join('') + '</div>';
  var count = card.abilities.length;
  return '<div class="inspector-title"><div class="inspector-icon">' + card.icon + '</div>' +
    '<div><div class="inspector-name">' + card.name + (card.cost ? ' <span class="pos-limit">⚡' + card.cost + ' to field</span>' : '') +
    '</div><div class="inspector-role">' + roleLabel(card) +
    (count > 1 ? ' · choose 1 of ' + count + ' abilities' : '') + '</div></div></div>' +
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
