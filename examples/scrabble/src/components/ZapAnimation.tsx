import { useEffect, useRef } from "react";
import "./ZapAnimation.css";

interface ZapAnimationProps {
  onComplete?: () => void;
}

export default function ZapAnimation({ onComplete }: ZapAnimationProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const generateLightning = () => {
    if (!svgRef.current || !containerRef.current) return;

    const svg = svgRef.current;
    const ancho = containerRef.current.clientWidth;
    const altura = containerRef.current.clientHeight;

    // Calculate a safe starting position that's not too close to the edges
    const safeWidthStart = ancho * 0.15;
    const safeWidthEnd = ancho * 0.85;
    const safeWidth = safeWidthEnd - safeWidthStart;

    const xInicio = safeWidthStart + Math.random() * safeWidth;
    let yActual = 0;
    let zigzag = `M${xInicio},${yActual}`;

    const grosor = Math.random() * 3 + 2; // 2-5px stroke
    const color = Math.random() > 0.5 ? "white" : "#ffcc00"; // white or yellow

    const segments = Math.floor(Math.random() * 3 + 5); // 5-7 segments

    for (let i = 0; i < segments; i++) {
      const maxOffset = Math.min(100, safeWidth * 0.25);
      const xOffset = (Math.random() - 0.5) * maxOffset;

      let yOffset;
      if (i === segments - 1) {
        yOffset = altura - yActual;
      } else {
        yOffset = (altura / segments) * (1 + Math.random() * 0.5);
      }

      yActual += yOffset;

      let newX = xInicio + xOffset;
      const edgeBuffer = ancho * 0.08;
      if (newX < edgeBuffer) newX = edgeBuffer;
      if (newX > ancho - edgeBuffer) newX = ancho - edgeBuffer;

      zigzag += ` L${newX},${yActual}`;

      // Add random branches (less frequently)
      if (Math.random() > 0.85) {
        const branchOffsetMax = maxOffset * 0.8;
        const branchOffset = (Math.random() - 0.5) * branchOffsetMax;
        let branchX = newX + branchOffset;

        const branchEdgeBuffer = ancho * 0.05;
        if (branchX < branchEdgeBuffer) branchX = branchEdgeBuffer;
        if (branchX > ancho - branchEdgeBuffer)
          branchX = ancho - branchEdgeBuffer;

        const branchY = yActual + Math.random() * 30;
        zigzag += ` M${newX},${yActual} L${branchX},${branchY} M${newX},${yActual}`;
      }
    }

    const linea = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    linea.setAttribute("d", zigzag);
    linea.setAttribute("class", "zap-bolt");
    linea.setAttribute("stroke", color);
    linea.setAttribute("stroke-width", grosor.toString());
    linea.setAttribute("fill", "none");
    svg.appendChild(linea);

    // Add flash effect
    if (containerRef.current) {
      containerRef.current.classList.add("zap-flash");
      setTimeout(() => {
        containerRef.current?.classList.remove("zap-flash");
      }, 200);
    }

    // Clean up the lightning after animation
    setTimeout(() => {
      if (svg.contains(linea)) {
        svg.removeChild(linea);
      }
    }, 800);
  };

  useEffect(() => {
    // Generate lightning bolts
    generateLightning();

    // Generate a second bolt slightly delayed for more impact
    setTimeout(generateLightning, 100);

    // Call onComplete after animation finishes
    const timer = setTimeout(() => {
      onComplete?.();
    }, 1000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div ref={containerRef} className="zap-animation-container">
      <svg ref={svgRef} className="zap-animation-svg"></svg>
    </div>
  );
}
