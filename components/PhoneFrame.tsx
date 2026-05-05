'use client';

import { ReactNode } from 'react';

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex justify-center items-start bg-[#F0EFEB] sm:p-5 sm:bg-[#F0EFEB] bg-bg p-0">
      <div className="phone w-[390px] h-[844px] bg-bg rounded-[40px] overflow-hidden relative flex flex-col shadow-[0_8px_32px_rgba(0,0,0,0.1),0_0_0_8px_#1A1A1A] sm-phone-full">
        <div className="notch absolute top-0 left-1/2 -translate-x-1/2 w-[126px] h-[34px] bg-[#1A1A1A] rounded-b-[20px] z-10" />
        <StatusBar />
        {children}
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="status-bar h-[54px] px-7 pt-[14px] flex justify-between items-center text-sm font-semibold flex-shrink-0 font-mono">
      <span>9:41</span>
      <div className="flex gap-1.5 items-center">
        <span className="text-xs">●●●●</span>
        <span className="text-xs">📶</span>
        <span className="text-xs">🔋</span>
      </div>
    </div>
  );
}
