// Shared card data + deck helpers for fd7 (index.html game + decks.html builder).

// League-style unit stats:
//   hp     health
//   ad     attack damage — auto-attacks deal this as physical damage
//   ap     ability power — Medic heals for this
//   armor  reduces physical damage, mr (magic resist) reduces magic damage: taken = dmg × 100 / (100 + resist)
//   as     attack speed — actions per second, one second being TICKS_PER_SECOND ticks (0 = never acts)
//   con    construction — each Construct action adds this much to your construction pool, which pays for
//          structures (STRUCTURE_DEFS)
// `prefers` is the line ('front', 'middle', 'back') a unit is placed on first when the board is filled each round.
// Every unit has a list of `abilities`; each round its owner picks which one it uses (ids resolve in ABILITIES in
// index.html). An ability with `lines` can only be used from slots on those lines ('front', 'middle', 'back');
// a `passive` one is never acted out — it works just by the unit being on the board (Warden's Taunt).
// Board slots also matter for targeting (attacks land on the frontmost unit) and turn order.
var TICKS_PER_SECOND = 10;

var CARD_DEFS = {
  striker:   { key:'striker',   name:'Striker',   icon:'⚔', role:'attacker', prefers:'front', hp:30, ad:10, ap:0,  armor:15, mr:10, as:0.5, con:10,
    abilities:[
      { id:'heavy',   name:'Heavy attack', short:'HEAVY',   text:'Hits a random enemy for 150% of its AD.' },
      { id:'execute', name:'Execute',      short:'EXECUTE', text:'Attack the most damaged enemy (lowest HP %) for 100% AD.' }
    ] },
  medic:     { key:'medic',     name:'Medic',     icon:'✚', role:'healer', prefers:'middle',   hp:50, ad:0,  ap:10, armor:5, mr:25, as:1, con:5,
    abilities:[
      { id:'heal',   name:'Heal',    short:'HEAL', text:'Heals your weakest ally for 100% AP.' },
      { id:'adbuff', name:'AD buff', short:'+AD',  text:'Gives every friendly on-field unit +3 AD permanently.' },
    ] },
  predator:  { key:'predator',  name:'Predator',  icon:'♦', role:'attacker', prefers:'back', hp:30, ad:14, ap:0,  armor:10, mr:10, as:0.5, con:10,
    abilities:[
      { id:'trophy', name:'Trophy', short:'TROPHY', lines:['back'], text:'Attack the frontmost enemy for 100% AD. If this ability kills the target, permanently gain +2 AD.' },
      { id:'flank',  name:'Flank',  short:'FLANK',  text:'Attacks the backmost enemy for 50% AD.' }
    ] },
  warden:    { key:'warden',    name:'Warden',    icon:'⛉', role:'support', prefers:'front',  hp:40, ad:0,  ap:0,  armor:40, mr:30, as:0.5, con:10,
    abilities:[
      { id:'taunt', name:'Taunt', short:'TAUNT', passive:true, text:'Never acts. While Warden lives, every enemy attack must target it.' }
    ] },
  saboteur:  { key:'saboteur',  name:'Saboteur',  icon:'⚙', role:'support', prefers:'back',  hp:32, ad:0,  ap:0,  armor:25, mr:25, as:0.5, con:20,
    abilities:[
      { id:'sabotage', name:'Sabotage', short:'DELAY', text:'Delays the next enemy to act by 5 ticks.' },
      { id:'jam',      name:'Jam',      short:'JAM',   lines:['back'], text:'The next enemy to act skips its ability effect, then resets its charge normally.' }
    ] }
};
// The battle runs on ticks, so each unit's attack speed becomes a cooldown in ticks (AS 0.5 → every 20 ticks).
// Every unit also gets a final "No action" option: chosen, it just stands there for the round and never acts.
var NO_ACTION = { id:'none', name:'No action', short:'NO ACTION', passive:true, text:'Does nothing this round.' };
// Every unit can also Construct: each action adds its CON to your construction pool (see con above).
var CONSTRUCT = { id:'construct', name:'Construct', short:'BUILD', text:'Adds this unit\'s Construction (CON) to your construction pool.' };
Object.keys(CARD_DEFS).forEach(function(k){
  var c = CARD_DEFS[k];
  c.cooldown = c.as > 0 ? Math.round(TICKS_PER_SECOND / c.as) : Infinity;
  c.abilities.push(CONSTRUCT, NO_ACTION);
});

var DECK_SIZE = 12;   // every deck is exactly this many cards
var HAND_SIZE = 6;    // cards drawn each round; 4 of them are placed (see autoPlace in index.html)
var DEFAULT_RECIPE = { striker:3, medic:3, predator:2, warden:2, saboteur:2 };
var MAX_COPIES = 6;
// The board slots by index, front to back: two front-line slots, one middle, one back. Attacks land on the
// frontmost unit by default. On screen each side's front faces the middle, so the left player's board is drawn
// back to front.
var SLOT_NAMES = ['Front', 'Front', 'Middle', 'Back'];
var SLOT_LINES = ['front', 'front', 'middle', 'back'];
var DECK_STORAGE_KEY = 'fd7-deck-recipes';

// Structures are built in setup with your construction pool and stay for the rest of the game. Any number can be
// built, duplicates included; their effects stack. Effects apply to your own side (see index.html).
// A structure with a `trigger` fires when that event happens to one of your units, paying `spend` construction from
// your pool each time (it does nothing if you can't pay). Its bonuses last for the round.
var STRUCTURE_DEFS = {
  clinic: { key:'clinic', name:'Overflow Clinic', icon:'✙', cost:60,
    text:'Healing beyond a unit\'s max HP raises its max HP by the excess, for the round. Heals can also target full-HP units.' },
  wardrum: { key:'wardrum', name:'War Drum', icon:'♫', cost:60, trigger:'attack', spend:3,
    text:'An ally attacks — spend 3: give all allies +2 AD.' },
  shrine: { key:'shrine', name:'Growth Shrine', icon:'❦', cost:60, trigger:'heal', spend:3,
    text:'An ally heals — spend 3: give all allies +5 maximum HP.' },
  bloodengine: { key:'bloodengine', name:'Blood Engine', icon:'❂', cost:60, trigger:'damaged', spend:3,
    text:'An ally takes damage — spend 3: give that ally +3 AD.' }
};

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
          'AS ' + (card.as > 0 ? card.as.toFixed(2) : '—'), 'CON ' + card.con];
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
      '<div><b>' + ab.name + '</b>' + (limit ? ' <span class="pos-limit">' + limit + '</span>' : '') + ' — ' + ab.text + '</div></div>';
  }).join('') + '</div>';
  var count = card.abilities.length;
  return '<div class="inspector-title"><div class="inspector-icon">' + card.icon + '</div>' +
    '<div><div class="inspector-name">' + card.name + '</div><div class="inspector-role">' + roleLabel(card) +
    (card.prefers ? ' · prefers the ' + card.prefers : '') +
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
