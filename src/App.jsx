import React, { useState } from "react";
import SignalPad from "./components/SignalPad";
import SplashScreen from "./components/SplashScreen";

export default function App() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <SignalPad />
    </>
  );
}
