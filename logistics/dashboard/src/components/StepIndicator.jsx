import React from 'react'

export default function StepIndicator({ currentStep = 0, steps = [] }) {
  return (
    <div className="flex items-center gap-1">
      {steps.map((label, index) => {
        const isActive = index === currentStep
        const isCompleted = index < currentStep
        const isLast = index === steps.length - 1

        return (
          <React.Fragment key={index}>
            {/* Step */}
            <div className="flex items-center gap-2">
              {/* Circle */}
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-300 ${
                isCompleted
                  ? 'bg-emerald-500 text-white'
                  : isActive
                    ? 'bg-logistics-600 text-white ring-2 ring-logistics-400/30 ring-offset-2 ring-offset-slate-800'
                    : 'bg-slate-700 text-slate-500'
              }`}>
                {isCompleted ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>

              {/* Label */}
              <span className={`text-sm font-medium transition-colors duration-200 ${
                isActive ? 'text-white' : isCompleted ? 'text-slate-300' : 'text-slate-500'
              }`}>
                {label}
              </span>
            </div>

            {/* Connector */}
            {!isLast && (
              <div className="flex-shrink-0 mx-2">
                <div className={`w-8 h-0.5 rounded-full transition-colors duration-300 ${
                  isCompleted ? 'bg-emerald-500' : 'bg-slate-700'
                }`} />
              </div>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
