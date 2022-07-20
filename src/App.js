import React, { useEffect, useState } from "react";
import "./App.css";
import axios from "./axios";

function App() {
  const [result, setResult] = useState("");

  useEffect(() => {
    axios.get("api/").then((response) => {
      setResult(response.data);
    });
  }, []);

  return (

    <div className="App">

      {
        (result && typeof result === undefined) ?
          (<span>Cargando...</span>) :
          result && (result.map((element, index) => (<span key={index}>{element.name}</span>)))
      }

    </div>

  )
}
export default App;