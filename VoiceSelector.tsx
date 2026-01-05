
import React from 'react';
import { VoiceName } from '../types';
import { VOICE_OPTIONS } from '../constants';

interface VoiceSelectorProps {
  selectedVoice: VoiceName;
  onSelect: (voice: VoiceName) => void;
  disabled?: boolean;
}

const VoiceSelector: React.FC<VoiceSelectorProps> = ({ selectedVoice, onSelect, disabled }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
      {VOICE_OPTIONS.map((voice) => (
        <button
          key={voice.id}
          onClick={() => onSelect(voice.id)}
          disabled={disabled}
          className={`
            p-4 rounded-xl text-left transition-all border-2
            ${selectedVoice === voice.id 
              ? 'border-blue-500 bg-blue-50' 
              : 'border-slate-100 bg-white hover:border-slate-300'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          <div className="font-bold text-slate-800">{voice.label}</div>
          <div className="text-xs text-slate-500 mt-1">{voice.description}</div>
        </button>
      ))}
    </div>
  );
};

export default VoiceSelector;
