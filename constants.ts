
import { VoiceName, VoiceOption } from './types';

export const VOICE_OPTIONS: VoiceOption[] = [
  { id: VoiceName.KORE, label: 'Kore', description: 'Deep and resonant masculine voice' },
  { id: VoiceName.PUCK, label: 'Puck', description: 'Energetic and youthful voice' },
  { id: VoiceName.CHARON, label: 'Charon', description: 'Calm and steady narrator voice' },
  { id: VoiceName.FENRIR, label: 'Fenrir', description: 'Powerful and authoritative voice' },
  { id: VoiceName.ZEPHYR, label: 'Zephyr', description: 'Light and airy professional voice' }
];

export const MAX_CHUNK_SIZE = 800; // Optimal character limit per API request for stability
export const SAMPLE_RATE = 24000;
