import { AD_KEYS, pruneAds } from "@shared/adblock/prune";

/**
 * Main-world IIFE injected at document start, before YouTube's scripts. It prunes ad payloads from
 * `JSON.parse` / `Response.prototype.json` results and from `ytInitialPlayerResponse` / `ytInitialData`.
 * Every hook falls back to the original value on error: a pruning failure must never stop playback.
 * Uses page globals only (context isolation is on); counts removals in `window.__YTMD_ADBLOCK__.pruned`.
 */
export const ADBLOCK_PRUNE_SOURCE = `(() => {
  try {
    if (window.__YTMD_ADBLOCK__) return;
    var state = { pruned: 0 };
    window.__YTMD_ADBLOCK__ = state;
    var pruneAds = (${pruneAds.toString()});
    var TRIGGERS = ${JSON.stringify([...AD_KEYS, "playerResponse", "auxiliaryUi"])};
    var has = Object.prototype.hasOwnProperty;
    function hasTrigger(v) {
      if (!v || typeof v !== "object") return false;
      for (var i = 0; i < TRIGGERS.length; i++) if (has.call(v, TRIGGERS[i])) return true;
      return false;
    }
    function relevant(v) {
      if (Array.isArray(v)) {
        for (var i = 0; i < v.length; i++) if (hasTrigger(v[i])) return true;
        return false;
      }
      return hasTrigger(v);
    }
    function prune(v) {
      try {
        if (relevant(v)) {
          var n = pruneAds(v);
          if (n > 0) state.pruned += n;
        }
      } catch (e) {}
      return v;
    }

    try {
      var origParse = JSON.parse;
      JSON.parse = function parse(text, reviver) {
        var result = origParse.apply(this, arguments);
        return prune(result);
      };
    } catch (e) {}

    try {
      var origJson = Response.prototype.json;
      Response.prototype.json = function json() {
        var p = origJson.apply(this, arguments);
        try {
          return p.then(prune);
        } catch (e) {
          return p;
        }
      };
    } catch (e) {}

    ["ytInitialPlayerResponse", "ytInitialData"].forEach(function (name) {
      try {
        var value = prune(window[name]);
        Object.defineProperty(window, name, {
          configurable: true,
          enumerable: true,
          get: function () { return value; },
          set: function (v) { value = prune(v); }
        });
      } catch (e) {}
    });
  } catch (e) {}
})();`;
