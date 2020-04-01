import React from 'react';
import { 
  BrowserRouter, Route, 
  // Redirect 
} from 'react-router-dom'

import './App.css';
import Guest from './page/Guest'
import Agent from './page/Agent'
import NotFound from './page/NotFound'

function App() {
  return (
    <BrowserRouter>
      <React.Fragment>
        <Route path="/" exact component={Guest} />
        <Route path="/agent" exact component={Agent} />
        {/* <Route path="*" exact component={NotFound} /> */}
      </React.Fragment>
    </BrowserRouter>
  );
}

export default App;
