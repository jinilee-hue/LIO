/**
 * gemini-live.js — Gemini Live (Multimodal Live API) wrapper
 * Real-time bidirectional audio: mic → Gemini → speaker
 */

const GeminiLive = (() => {
  const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.BidiGenerateContent';

  let _ws       = null;
  let _micCtx   = null;
  let _outCtx   = null;
  let _stream   = null;
  let _proc     = null;
  let _nextTime = 0;
  let _onTool   = null;

  /* ── Pre-warm audio context during user gesture ──
     Call this synchronously inside a click handler, before any await. */
  function warmUpAudio() {
    _getOutCtx();
    if (_outCtx.state === 'suspended') {
      _outCtx.resume().then(() => console.log('[GeminiLive] AudioContext running'));
    }
  }

  /* ── Connect & Setup ── */
  async function connect({ apiKey, systemPrompt, tools = [], onToolCall }) {
    _onTool = onToolCall;

    return new Promise((resolve, reject) => {
      _ws = new WebSocket(`${WS_URL}?key=${apiKey}`);

      const timer = setTimeout(() => reject(new Error('Connection timeout')), 12000);

      _ws.onopen = () => {
        console.log('[GeminiLive] WebSocket open — sending setup');
        _ws.send(JSON.stringify({
          setup: {
            model: 'models/gemini-2.0-flash-live-001',
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
              },
            },
            systemInstruction: { parts: [{ text: systemPrompt }] },
            tools: tools.length ? [{ functionDeclarations: tools }] : [],
          },
        }));
      };

      _ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }

        if (msg.setupComplete) {
          console.log('[GeminiLive] Setup complete — ready');
          clearTimeout(timer);
          resolve();
          return;
        }

        // Audio chunks from Gemini → play
        const parts = msg.serverContent?.modelTurn?.parts ?? [];
        for (const p of parts) {
          if (p.inlineData?.data) {
            console.log('[GeminiLive] Audio chunk received, size:', p.inlineData.data.length);
            _playChunk(p.inlineData.data);
          }
        }

        // Function / tool call
        if (msg.toolCall?.functionCalls) {
          for (const fc of msg.toolCall.functionCalls) {
            console.log('[GeminiLive] Tool call:', fc.name, fc.args);
            _onTool?.(fc.name, fc.args ?? {});
            _ws?.send(JSON.stringify({
              toolResponse: {
                functionResponses: [{ id: fc.id, response: { result: { output: 'ok' } } }],
              },
            }));
          }
        }
      };

      _ws.onerror = (e) => {
        console.error('[GeminiLive] WebSocket error', e);
        clearTimeout(timer);
        reject(new Error('WebSocket error'));
      };
      _ws.onclose = (e) => {
        console.log('[GeminiLive] WebSocket closed, code:', e.code, e.reason);
      };
    });
  }

  /* ── Microphone → Gemini ── */
  async function startMic() {
    _stream  = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    _micCtx  = new AudioContext({ sampleRate: 16000 });
    const src = _micCtx.createMediaStreamSource(_stream);
    _proc    = _micCtx.createScriptProcessor(4096, 1, 1);

    // Route through silent gain — prevents mic audio from echoing through speakers
    const silentGain = _micCtx.createGain();
    silentGain.gain.value = 0;

    _proc.onaudioprocess = (e) => {
      if (_ws?.readyState !== WebSocket.OPEN) return;
      const f32  = e.inputBuffer.getChannelData(0);
      const i16  = new Int16Array(f32.length);
      for (let i = 0; i < f32.length; i++) {
        i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32768));
      }
      const bytes = new Uint8Array(i16.buffer);
      // Encode bytes as base64 via btoa
      let bin = '';
      const chunk = 8192;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      _ws.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: btoa(bin) }],
        },
      }));
    };

    src.connect(_proc);
    _proc.connect(silentGain);
    silentGain.connect(_micCtx.destination);

    console.log('[GeminiLive] Mic started');
  }

  /* ── Send text trigger ── */
  function sendText(text) {
    if (_ws?.readyState !== WebSocket.OPEN) {
      console.warn('[GeminiLive] sendText called but WS not open');
      return;
    }
    console.log('[GeminiLive] Sending text:', text);
    _ws.send(JSON.stringify({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      },
    }));
  }

  /* ── Cleanup ── */
  function disconnect() {
    try { _proc?.disconnect(); } catch {}
    _proc = null;
    _stream?.getTracks().forEach(t => t.stop());
    _stream = null;
    _micCtx?.close().catch(() => {});
    _micCtx = null;
    if (_ws && _ws.readyState === WebSocket.OPEN) _ws.close();
    _ws = null;
    _nextTime = 0;
    console.log('[GeminiLive] Disconnected');
  }

  /* ── Audio Output ── */
  function _getOutCtx() {
    if (!_outCtx || _outCtx.state === 'closed') {
      _outCtx   = new AudioContext({ sampleRate: 24000 });
      _nextTime = 0;
      console.log('[GeminiLive] AudioContext created, state:', _outCtx.state);
    }
    if (_outCtx.state === 'suspended') {
      _outCtx.resume().catch(() => {});
    }
    return _outCtx;
  }

  function _playChunk(b64) {
    try {
      const ctx  = _getOutCtx();
      if (ctx.state === 'suspended') {
        console.warn('[GeminiLive] AudioContext still suspended — audio may not play');
      }
      const bin  = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

      const i16 = new Int16Array(bytes.buffer);
      const f32 = new Float32Array(i16.length);
      for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;

      const buf = ctx.createBuffer(1, f32.length, 24000);
      buf.copyToChannel(f32, 0);

      const now = ctx.currentTime;
      if (_nextTime < now) _nextTime = now + 0.05;

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(_nextTime);
      _nextTime += buf.duration;
    } catch (e) {
      console.warn('[GeminiLive] audio error:', e.message);
    }
  }

  return { connect, startMic, sendText, disconnect, warmUpAudio };
})();
