// Shared card data + deck helpers for fd7 (index.html game + decks.html builder).

// League-style unit stats:
//   hp     health
//   ad     attack damage — auto-attacks deal this as physical damage
//   ap     ability power — Medic heals for this
//   armor  reduces physical damage, mr (magic resist) reduces magic damage: taken = dmg × 100 / (100 + resist)
//   as     attack speed — actions per second, one second being TICKS_PER_SECOND ticks (0 = never acts)
// Roles: attackers deal their AD as physical damage, mages their AP as magic damage, healers heal for their AP,
// tanks and supports never act — they matter through their passives.
// Optional ability flags, read by the battle engine:
//   targetsBack   attacks the right-most enemy instead of the left-most, slipping past Bodyguard (taunt still wins)
//   armorPen      fraction of the target's armor ignored
//   lifesteal     heals itself for this fraction of the damage it deals
//   hitsAll       its attack hits every enemy unit
//   adjAttackSpeed  adjacent allies gain this much attack speed (0.5 = +50%)
//   adjResist     adjacent allies gain this much armor and MR
//   revives       the first time it would die each round, it comes back at half HP instead
//   staysOnTop    if it survives the round, it stays on top of your deck instead of being discarded
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
    effect:'If Bulwark is your only unit when the battle begins, it doubles its HP and taunts — every enemy attack must target it.' },

  arcanist:    { key:'arcanist',    name:'Arcanist',    icon:'✦', role:'mage',     hp:14, ad:0,  ap:12, armor:10, mr:20, as:0.5,
    effect:'Blasts the enemy front line for its AP as magic damage — armor does nothing against it, only MR.' },
  stormcaller: { key:'stormcaller', name:'Stormcaller', icon:'☈', role:'mage',     hp:16, ad:0,  ap:6,  armor:10, mr:25, as:0.33, hitsAll:true,
    effect:'Slow caster. Each cast hits every enemy unit for its AP as magic damage.' },
  shade:       { key:'shade',       name:'Shade',       icon:'☾', role:'attacker', hp:14, ad:12, ap:0,  armor:15, mr:15, as:0.5, targetsBack:true,
    effect:'Assassin. Attacks the enemy back line (right-most unit) and slips past Bodyguard. A taunt still pulls it.' },
  duelist:     { key:'duelist',     name:'Duelist',     icon:'⚚', role:'attacker', hp:16, ad:4,  ap:0,  armor:15, mr:10, as:1,
    effect:'Attacks twice as often as anyone else, for small hits — shreds fragile units, bounces off heavy armor.' },
  marksman:    { key:'marksman',    name:'Marksman',    icon:'➶', role:'attacker', hp:12, ad:20, ap:0,  armor:10, mr:10, as:0.35, armorPen:0.5,
    effect:"Slow, heavy shots that ignore half the target's armor. Built to crack tanks." },
  leech:       { key:'leech',       name:'Leech',       icon:'❦', role:'attacker', hp:18, ad:8,  ap:0,  armor:15, mr:15, as:0.5, lifesteal:0.5,
    effect:'Heals itself for half the damage it deals.' },
  phoenix:     { key:'phoenix',     name:'Phoenix',     icon:'♨', role:'attacker', hp:14, ad:8,  ap:0,  armor:10, mr:10, as:0.5, revives:true,
    effect:'The first time it would die each round, it bursts back to life at half HP.' },
  veteran:     { key:'veteran',     name:'Veteran',     icon:'✪', role:'attacker', hp:20, ad:9,  ap:0,  armor:20, mr:15, as:0.5, staysOnTop:true,
    effect:'If Veteran survives the round, it stays on top of your deck for the next round instead of being discarded.' },
  drummer:     { key:'drummer',     name:'War Drummer', icon:'♫', role:'support',  hp:16, ad:0,  ap:0,  armor:15, mr:15, as:0, adjAttackSpeed:0.5,
    effect:'Never attacks. Units next to it attack 50% faster. Best in the middle slot.' },
  warden:      { key:'warden',      name:'Warden',      icon:'⛉', role:'support',  hp:20, ad:0,  ap:0,  armor:30, mr:30, as:0, adjResist:20,
    effect:'Never attacks. Units next to it gain +20 armor and +20 MR. Best in the middle slot.' }
};
// The battle runs on ticks, so each unit's attack speed becomes a cooldown in ticks (AS 0.5 → every 20 ticks).
Object.keys(CARD_DEFS).forEach(function(k){
  var c = CARD_DEFS[k];
  c.cooldown = c.as > 0 ? Math.round(TICKS_PER_SECOND / c.as) : Infinity;
});

var DECK_SIZE = 9;   // every deck is exactly this many cards
var DEFAULT_RECIPE = { striker:1, medic:1, bodyguard:1, arcanist:1, shade:1, duelist:1, marksman:1, drummer:1, warden:1 };
var MAX_COPIES = 6;
var ROUND_PICKS = 3;   // each round you field units from the top 3 cards of your deck
var DECK_STORAGE_KEY = 'fd7-deck-recipes';

function el(tag, cls, attrs){
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function roleLabel(card){
  return { attacker:'Attacker', mage:'Mage', healer:'Healer', tank:'Tank', support:'Support' }[card.role];
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
