import React from 'react';
import { Toolbar } from '@/components/toolbar/Toolbar';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { PDFViewer } from '@/components/viewer/PDFViewer';
import { StatusBar } from '@/components/common/StatusBar';
import { useKeyboardShortcuts, useAutoSave } from '@/hooks';
import './i18n';

const App: React.FC = () => {
  // 初始化全局快捷键
  useKeyboardShortcuts();
  // 初始化自动保存
  useAutoSave(30000);

  return (
    <div className="app-layout">
      <Toolbar />
      <div className="app-main">
        <Sidebar />
        <PDFViewer />
      </div>
      <StatusBar />
    </div>
  );
};

export default App;
