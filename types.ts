
export enum VoiceName {
  KORE = 'Kore',
  PUCK = 'Puck',
  CHARON = 'Charon',
  FENRIR = 'Fenrir',
  ZEPHYR = 'Zephyr'
}

export type AppTab = 'tts' | 'transcribe' | 'live';

export interface AudioState {
  isPlaying: boolean;
  progress: number;
  currentChunk: number;
  totalChunks: number;
  status: 'idle' | 'processing' | 'playing' | 'error';
}

export interface VoiceOption {
  id: VoiceName;
  label: string;
  description: string;
}
