import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
// Side-effect import: registers cross-module event handlers on the integration bus.
import './lib/integrationHandlers.js';

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
