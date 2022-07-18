import React, { useEffect } from "react";
import "./App.css";

function App() {

  useEffect(() => {
    console.log("This only run once!");
  }, []);

  return (
    <div className="App">
    </div>
  );
}

export default App;
