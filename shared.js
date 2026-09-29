// Shared card data + deck helpers for fd7 (index.html game + decks.html builder).

// League-style unit stats:
//   hp     health
//   ad     attack damage — auto-attacks deal this as physical damage
//   ap     ability power — Medic heals for this
//   armor  reduces physical damage, mr (magic resist) reduces magic damage: taken = dmg × 100 / (100 + resist)
//   as     attack speed — actions per second, one second being TICKS_PER_SECOND ticks (0 = never acts)
var TICKS_PER_SECOND = 10;

var CARD_DEFS = {
  striker:   { key:'striker',   name:'Striker',   icon:'⚔', role:'attacker', hp:20, ad:10, ap:0,  armor:20, mr:10, as:0.5,
    effect:'Auto-attacks the enemy front line for its AD as physical damage.' },
  medic:     { key:'medic',     name:'Medic',     icon:'✚', role:'healer',   hp:15, ad:0,  ap:10, armor:10, mr:25, as:0.5,
    effect:'Each action, heals your most wounded unit (by %) for its AP.' },
  predator:  { key:'predator',  name:'Predator',  icon:'♦', role:'attacker', hp:18, ad:16, ap:0,  armor:15, mr:10, as:0.5,
    effect:'Hard-hitting attacker. When it dies, its death throes hit every other unit on your side for 5 true damage.' },
  bodyguard: { key:'bodyguard', name:'Bodyguard', icon:'⛨', role:'tank',     hp:22, ad:0,  ap:0,  armor:50, mr:20, as:0,
    effect:'Every enemy attack aimed at another of your units hits Bodyguard instead, for as long as it lives.' },
  bulwark:   { key:'bulwark',   name:'Bulwark',   icon:'⛊', role:'tank',     hp:16, ad:0,  ap:0,  armor:40, mr:40, as:0,
    effect:'If Bulwark is your only unit when the battle begins, it doubles its HP and taunts — every enemy attack must target it.' }
};
// The battle runs on ticks, so each unit's attack speed becomes a cooldown in ticks (AS 0.5 → every 20 ticks).
Object.keys(CARD_DEFS).forEach(function(k){
  var c = CARD_DEFS[k];
  c.cooldown = c.as > 0 ? Math.round(TICKS_PER_SECOND / c.as) : Infinity;
});

var DEFAULT_RECIPE = { striker:4, medic:4, predator:4, bodyguard:4, bulwark:4 };
var MAX_COPIES = 6;
var INITIAL_HAND = 5;
var DECK_STORAGE_KEY = 'fd7-deck-recipes';

function el(tag, cls, attrs){
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function roleLabel(card){
  return { attacker:'Attacker', healer:'Healer', tank:'Tank' }[card.role];
}

// ['HP 20', 'AD 10', 'AP 0', 'ARM 20', 'MR 10', 'AS 0.50']
function statList(card){
  return ['HP ' + card.hp, 'AD ' + card.ad, 'AP ' + card.ap, 'ARM ' + card.armor, 'MR ' + card.mr,
          'AS ' + (card.as > 0 ? card.as.toFixed(2) : '—')];
}

// Title, stat pills and effect text for a "Card Info" panel.
function cardInfoHtml(card){
  return '<div class="inspector-title"><div class="inspector-icon">' + card.icon + '</div>' +
    '<div><div class="inspector-name">' + card.name + '</div><div class="inspector-role">' + roleLabel(card) + '</div></div></div>' +
    '<div class="inspector-stats">' + statList(card).map(function(t){ return '<span class="stat-pill mono">' + t + '</span>'; }).join('') + '</div>' +
    '<div class="inspector-effect">' + card.effect + '</div>';
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
    if (Array.isArray(parsed) && parsed.length === 2) return [sanitizeRecipe(parsed[0]), sanitizeRecipe(parsed[1])];
  } catch (e){}
  return [defaultRecipe(), defaultRecipe()];
}
function saveDeckRecipes(recipes){
  try { localStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(recipes)); } catch (e){}
}
