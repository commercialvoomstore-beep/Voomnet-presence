'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ——— Synthèse Web Audio : chimes premium discrets (aucun fichier audio) ———
// Volume de crête par niveau (faible par défaut, jamais agressif).
const VOLUMES = { faible: 0.12, normal: '0.22' };

// Une note douce : fondamentale sinusoïdale + harmonique d'octave discrète,
// enveloppe attaque rapide puis décroissance exponentielle (timbre "chime").
function note(ctx, master, freq, delay, dur, peak) {
  const t = ctx.currentTime + delay;
  [
    [freq, 1],
    [freq * 2, 0.22],
  ].forEach(([f, g]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, g * peak), t + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  });
}

// ARRIVÉE : chime doux montant (E5 → A5), ~0,8 s
export function playArrivalSound(ctx, master, peak) {
  note(ctx, master, 659.25, 0, 0.55, peak);
  note(ctx, master, 880.0, 0.14, 0.65, peak);
}

// DÉPART : double chime doux descendant (G5 → D5), ~0,85 s
export function playDepartureSound(ctx, master, peak) {
  note(ctx, master, 783.99, 0, 0.45, peak);
  note(ctx, master, 587.33, 0.2, 0.65, peak);
}

// ——— Hook : préférences locales + déblocage autoplay navigateur ———
// Stockage local (préférence d'appareil) : aucun changement backend/API.
export function useNotificationSound() {
  const ctxRef = useRef(null);
  const masterRef = useRef(null);
  const [enabled, setEnabledState] = useState(true);
  const [volume, setVolumeState] = useState('faible');
  const [unlocked, setUnlocked] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const e = localStorage.getItem('vp_sound_enabled');
      if (e !== null) setEnabledState(e === '1');
      const v = localStorage.getItem('vp_sound_volume');
      if (v === 'faible' || v === 'normal') setVolumeState(v);
    } catch {
      /* stockage indisponible : valeurs par défaut */
    }
    setReady(true);
  }, []);

  const setEnabled = useCallback((v) => {
    setEnabledState(v);
    try {
      localStorage.setItem('vp_sound_enabled', v ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  const setVolume = useCallback((v) => {
    const next = v === 'normal' ? 'normal' : 'faible';
    setVolumeState(next);
    try {
      localStorage.setItem('vp_sound_volume', next);
    } catch {
      /* ignore */
    }
  }, []);

  // Crée (paresseusement) puis reprend le contexte audio après un geste utilisateur.
  const unlock = useCallback(async () => {
    try {
      if (!ctxRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctxRef.current = new AC();
        masterRef.current = ctxRef.current.createGain();
        masterRef.current.gain.value = 1;
        masterRef.current.connect(ctxRef.current.destination);
      }
      if (ctxRef.current.state === 'suspended') await ctxRef.current.resume();
      if (ctxRef.current.state === 'running') {
        setUnlocked(true);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  // Déblocage automatique dès la première interaction (politique autoplay des navigateurs).
  useEffect(() => {
    let dead = false;
    const tryUnlock = async () => {
      if (dead) return;
      const ok = await unlock();
      if (ok) {
        dead = true;
        window.removeEventListener('pointerdown', tryUnlock);
        window.removeEventListener('keydown', tryUnlock);
      }
    };
    window.addEventListener('pointerdown', tryUnlock);
    window.addEventListener('keydown', tryUnlock);
    return () => {
      dead = true;
      window.removeEventListener('pointerdown', tryUnlock);
      window.removeEventListener('keydown', tryUnlock);
    };
  }, [unlock]);

  const play = useCallback(
    (kind, force = false) => {
      if (!force && !enabled) return;
      const ctx = ctxRef.current;
      const master = masterRef.current;
      if (!ctx || !master || ctx.state !== 'running') return; // silencieux si verrouillé
      const peak = Number(VOLUMES[volume] || VOLUMES.faible);
      if (kind === 'arrival') playArrivalSound(ctx, master, peak);
      else playDepartureSound(ctx, master, peak);
    },
    [enabled, volume]
  );

  const playArrival = useCallback(() => play('arrival'), [play]);
  const playDeparture = useCallback(() => play('departure'), [play]);
  // Aperçus (boutons "Tester") : audibles même si les sons sont désactivés.
  const previewArrival = useCallback(() => play('arrival', true), [play]);
  const previewDeparture = useCallback(() => play('departure', true), [play]);

  return {
    ready,
    enabled,
    setEnabled,
    volume,
    setVolume,
    unlocked,
    unlock,
    playArrival,
    playDeparture,
    previewArrival,
    previewDeparture,
  };
}
