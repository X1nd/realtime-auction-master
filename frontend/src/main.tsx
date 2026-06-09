import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

console.log('[main] Starting React app, root element:', document.getElementById('root'));

try {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <App />,
  );
  console.log('[main] App rendered successfully');
} catch (e) {
  console.error('[main] Failed to render App:', e);
  document.getElementById('root')!.innerHTML = '<div style="padding:40px;color:red;font-family:monospace"><h1>渲染失败</h1><pre>' + String(e) + '</pre></div>';
}
