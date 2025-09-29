"use client";

import { useState, useRef, useEffect } from 'react';
import { ChevronDownIcon, CheckIcon } from '@heroicons/react/24/outline';

interface Option {
  value: string;
  label: string;
  emoji?: string;
}

interface CustomSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  gradientFrom?: string;
  gradientTo?: string;
  borderColor?: string;
  textColor?: string;
  hoverFrom?: string;
  hoverTo?: string;
  disabled?: boolean;
  dropdownPlacement?: "above" | "below";
}

export default function CustomSelect({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  className = "",
  gradientFrom = "blue-50",
  gradientTo = "indigo-50",
  borderColor = "blue-200",
  textColor = "blue-800",
  hoverFrom = "blue-100", 
  hoverTo = "indigo-100",
  disabled = false,
  dropdownPlacement = "below"
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selectedOption = options.find(option => option.value === value);

  const dropdownPositionClass = dropdownPlacement === "above"
    ? "bottom-full mb-2"
    : "top-full mt-2";

  const dropdownAnimationClass = dropdownPlacement === "above"
    ? "animate-in slide-in-from-bottom-2"
    : "animate-in slide-in-from-top-2";

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`
          w-full appearance-none bg-gradient-to-r from-${gradientFrom} to-${gradientTo} 
          border border-${borderColor} text-${textColor} px-4 py-2 pr-10 rounded-full 
          focus:ring-2 focus:ring-${borderColor.split('-')[0]}-500 focus:border-transparent 
          font-medium cursor-pointer hover:from-${hoverFrom} hover:to-${hoverTo} 
          transition-all duration-200 flex items-center justify-between
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${isOpen ? `ring-2 ring-${borderColor.split('-')[0]}-500` : ''}
        `}
      >
        <span className="flex items-center space-x-2">
          {selectedOption?.emoji && <span>{selectedOption.emoji}</span>}
          <span>{selectedOption?.label || placeholder}</span>
        </span>
        <ChevronDownIcon 
          className={`w-4 h-4 text-${textColor} transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className={`absolute left-0 right-0 z-50 min-w-max ${dropdownPositionClass}`}>

          <div className={`bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden transform transition-all duration-200 ${dropdownAnimationClass} min-w-full`}>

            <div className="max-h-64 overflow-y-auto custom-scrollbar">
              {options.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={`
                    w-full px-4 py-2.5 text-left transition-all duration-150 
                    flex items-center justify-between group relative min-w-max
                    hover:bg-gradient-to-r hover:from-gray-50 hover:to-blue-50
                    ${value === option.value 
                      ? 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-800 font-medium shadow-inner' 
                      : 'text-gray-700 hover:text-gray-900'
                    }
                    ${index === 0 ? 'rounded-t-2xl' : ''}
                    ${index === options.length - 1 ? 'rounded-b-2xl' : ''}
                    focus:outline-none focus:bg-blue-50 focus:ring-2 focus:ring-blue-300 focus:ring-inset
                  `}
                  style={{
                    animationDelay: `${index * 40}ms`,
                    animationFillMode: 'backwards'
                  }}
                >
                  <span className="flex items-center space-x-2.5 whitespace-nowrap">
                    {option.emoji && (
                      <span className="text-lg group-hover:scale-110 transition-transform duration-200">
                        {option.emoji}
                      </span>
                    )}
                    <span className="font-medium text-sm">{option.label}</span>
                  </span>
                  {value === option.value && (
                    <CheckIcon className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform duration-200 ml-3" />
                  )}
                  {/* Subtle selection indicator */}
                  {value === option.value && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-r-full"></div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
}