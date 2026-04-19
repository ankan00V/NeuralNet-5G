import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, useTexture } from "@react-three/drei";
import { Color, MathUtils, Quaternion, RepeatWrapping, SRGBColorSpace, Vector3 } from "three";

const stageStates = {
  observe: {
    camera: [9.8, 6.3, 14.6],
    target: [0, 4.7, 0],
    fov: 32,
    rotationY: -0.54,
    rotationX: 0.04,
    elevation: 0.08,
    signalStrength: 0.2,
    basePulse: 0.12,
    panelGlow: 0.12,
  },
  forecast: {
    camera: [0.4, 9.2, 10.4],
    target: [0, 7.1, 0],
    fov: 24,
    rotationY: 0.02,
    rotationX: 0.08,
    elevation: 0.2,
    signalStrength: 0.72,
    basePulse: 0.28,
    panelGlow: 0.42,
  },
  respond: {
    camera: [-6.9, 5.4, 9.2],
    target: [0.35, 4.4, 0],
    fov: 28,
    rotationY: 0.56,
    rotationX: -0.02,
    elevation: -0.04,
    signalStrength: 0.36,
    basePulse: 0.64,
    panelGlow: 0.22,
  },
};

const orderedStageIds = ["observe", "forecast", "respond"];

function interpolateArray(left, right, progress) {
  return left.map((value, index) => MathUtils.lerp(value, right[index], progress));
}

function getStageFromProgress(progress) {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const scaled = clampedProgress * (orderedStageIds.length - 1);
  const startIndex = Math.floor(scaled);
  const endIndex = Math.min(orderedStageIds.length - 1, startIndex + 1);
  const mix = scaled - startIndex;
  const start = stageStates[orderedStageIds[startIndex]];
  const end = stageStates[orderedStageIds[endIndex]];

  return {
    camera: interpolateArray(start.camera, end.camera, mix),
    target: interpolateArray(start.target, end.target, mix),
    fov: MathUtils.lerp(start.fov, end.fov, mix),
    rotationY: MathUtils.lerp(start.rotationY, end.rotationY, mix),
    rotationX: MathUtils.lerp(start.rotationX, end.rotationX, mix),
    elevation: MathUtils.lerp(start.elevation, end.elevation, mix),
    signalStrength: MathUtils.lerp(start.signalStrength, end.signalStrength, mix),
    basePulse: MathUtils.lerp(start.basePulse, end.basePulse, mix),
    panelGlow: MathUtils.lerp(start.panelGlow, end.panelGlow, mix),
  };
}

function Beam({ start, end, radius = 0.06, children }) {
  const transform = useMemo(() => {
    const from = new Vector3(...start);
    const to = new Vector3(...end);
    const midpoint = from.clone().add(to).multiplyScalar(0.5);
    const direction = to.clone().sub(from);
    const length = direction.length();
    const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize());

    return { length, midpoint, quaternion };
  }, [end, start]);

  return (
    <mesh position={transform.midpoint} quaternion={transform.quaternion} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, transform.length, 6]} />
      {children}
    </mesh>
  );
}

function SignalRings({ signalStrength }) {
  const groupRef = useRef(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const elapsedTime = state.clock.getElapsedTime();

    groupRef.current.children.forEach((child, index) => {
      const offset = index * 0.36;
      const pulse = (Math.sin(elapsedTime * 1.7 - offset * 4.2) + 1) * 0.5;
      const scale = 1 + pulse * 0.22 * MathUtils.lerp(0.3, 1, signalStrength) + index * 0.1;
      child.scale.setScalar(scale);
      child.material.opacity = MathUtils.lerp(0.02, 0.24, signalStrength) * (1 - pulse * 0.28);
    });
  });

  return (
    <group ref={groupRef} position={[0, 10.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
      {[0, 1, 2].map((ring) => (
        <mesh key={ring}>
          <torusGeometry args={[1.1 + ring * 0.52, 0.032, 10, 64]} />
          <meshBasicMaterial color="#2997ff" transparent opacity={0.08} />
        </mesh>
      ))}
    </group>
  );
}

function TowerStructure({ stageState }) {
  const groupRef = useRef(null);
  const panelRef = useRef(null);
  const basePulseRef = useRef(null);

  const [baseMap, normalMap, roughnessMap] = useTexture([
    "/assets/tower/basecolor.png",
    "/assets/tower/normal.png",
    "/assets/tower/roughness.png",
  ]);

  const beams = useMemo(() => {
    const levelYs = [0, 1.75, 3.5, 5.25, 7, 8.75, 10.5];
    const corners = [
      [-1.5, 0, -1.5],
      [1.5, 0, -1.5],
      [1.5, 0, 1.5],
      [-1.5, 0, 1.5],
    ];
    const result = [];

    levelYs.forEach((y, levelIndex) => {
      corners.forEach((corner, cornerIndex) => {
        const nextCorner = corners[(cornerIndex + 1) % corners.length];
        const point = [corner[0], y, corner[2]];

        if (levelIndex < levelYs.length - 1) {
          result.push({ start: point, end: [corner[0], levelYs[levelIndex + 1], corner[2]], radius: 0.07 });
          result.push({
            start: point,
            end: [nextCorner[0], levelYs[levelIndex + 1], nextCorner[2]],
            radius: 0.035,
          });
        }

        result.push({ start: point, end: [nextCorner[0], y, nextCorner[2]], radius: 0.05 });
      });
    });

    return result;
  }, []);

  const materialProps = useMemo(() => {
    [baseMap, normalMap, roughnessMap].forEach((texture) => {
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.repeat.set(1.4, 4.6);
    });

    baseMap.colorSpace = SRGBColorSpace;

    return {
      map: baseMap,
      normalMap,
      roughnessMap,
      metalness: 0.18,
      roughness: 0.76,
      color: new Color("#ffffff"),
    };
  }, [baseMap, normalMap, roughnessMap]);

  useFrame((state, delta) => {
    if (groupRef.current) {
      const elapsedTime = state.clock.getElapsedTime();
      const pointerX = state.pointer.x * 0.18;
      const pointerY = state.pointer.y * 0.1;
      const idleDrift = Math.sin(elapsedTime * 0.7) * 0.02;

      groupRef.current.rotation.y = MathUtils.damp(groupRef.current.rotation.y, stageState.rotationY + pointerX + idleDrift, 4.4, delta);
      groupRef.current.rotation.x = MathUtils.damp(groupRef.current.rotation.x, stageState.rotationX + pointerY, 4.4, delta);
      groupRef.current.position.y = MathUtils.damp(groupRef.current.position.y, stageState.elevation, 4.4, delta);
    }

    if (panelRef.current) {
      panelRef.current.children.forEach((child) => {
        child.material.emissiveIntensity = MathUtils.damp(
          child.material.emissiveIntensity,
          stageState.panelGlow,
          5.2,
          delta,
        );
      });
    }

    if (basePulseRef.current) {
      const elapsedTime = state.clock.getElapsedTime();
      const pulse = (Math.sin(elapsedTime * 2) + 1) * 0.5;
      const scale = 1 + stageState.basePulse * 0.08 + pulse * stageState.basePulse * 0.08;
      basePulseRef.current.scale.x = scale;
      basePulseRef.current.scale.z = scale;
      basePulseRef.current.material.opacity = 0.08 + stageState.basePulse * 0.14;
    }
  });

  return (
    <group ref={groupRef} position={[0, -4.55, 0]} scale={0.82}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow ref={basePulseRef}>
        <ringGeometry args={[2.2, 3.1, 56]} />
        <meshBasicMaterial color="#2997ff" transparent opacity={0.12} />
      </mesh>

      <mesh position={[0, 0, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[2.35, 2.75, 0.45, 8]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>

      {beams.map((beam, index) => (
        <Beam key={`${beam.start.join("-")}-${beam.end.join("-")}-${index}`} start={beam.start} end={beam.end} radius={beam.radius}>
          <meshStandardMaterial {...materialProps} />
        </Beam>
      ))}

      <mesh position={[0, 10.85, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.24, 0.24, 1.65, 10]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>

      <group ref={panelRef}>
        {[
          [1.65, 9.15, 0, 0],
          [-1.65, 9.15, 0, 0],
          [0, 9.15, 1.65, Math.PI / 2],
          [0, 9.15, -1.65, Math.PI / 2],
        ].map(([x, y, z, rotationY], index) => (
          <mesh key={`${x}-${y}-${z}-${index}`} position={[x, y, z]} rotation={[0, rotationY, 0]} castShadow>
            <boxGeometry args={[0.16, 1.65, 0.72]} />
            <meshStandardMaterial color="#ffffff" metalness={0.12} roughness={0.28} emissive="#2997ff" emissiveIntensity={0.16} />
          </mesh>
        ))}
      </group>

      <mesh position={[0, 9.65, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.7, 0.9, 0.2, 8]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>

      <mesh position={[0.92, 7.2, 1.28]} rotation={[0.22, 0.4, 0]} castShadow>
        <torusGeometry args={[0.5, 0.04, 10, 32, Math.PI]} />
        <meshStandardMaterial color="#f1f1f3" metalness={0.18} roughness={0.34} />
      </mesh>

      <mesh position={[-0.8, 6.3, -1.18]} rotation={[0.26, -0.8, 0]} castShadow>
        <torusGeometry args={[0.42, 0.035, 10, 32, Math.PI]} />
        <meshStandardMaterial color="#f1f1f3" metalness={0.18} roughness={0.34} />
      </mesh>

      <SignalRings signalStrength={stageState.signalStrength} />
    </group>
  );
}

function TowerRig({ scrollProgress }) {
  const cameraTargetRef = useRef(new Vector3(...stageStates.observe.target));

  useFrame((state, delta) => {
    const stageState = getStageFromProgress(scrollProgress);
    const elapsedTime = state.clock.getElapsedTime();
    const pointerCameraOffsetX = state.pointer.x * 0.35;
    const pointerCameraOffsetY = state.pointer.y * 0.18;
    const cinematicDrift = Math.sin(elapsedTime * 0.55) * 0.12;

    const cameraPosition = new Vector3(
      stageState.camera[0] + pointerCameraOffsetX,
      stageState.camera[1] + pointerCameraOffsetY + cinematicDrift,
      stageState.camera[2],
    );
    const targetPosition = new Vector3(
      stageState.target[0] + state.pointer.x * 0.18,
      stageState.target[1] + state.pointer.y * 0.08,
      stageState.target[2],
    );

    const cameraSmoothing = 1 - Math.exp(-delta * 2.8);
    const targetSmoothing = 1 - Math.exp(-delta * 3.6);

    state.camera.position.lerp(cameraPosition, cameraSmoothing);
    cameraTargetRef.current.lerp(targetPosition, targetSmoothing);
    state.camera.fov = MathUtils.damp(state.camera.fov, stageState.fov, 3.2, delta);
    state.camera.updateProjectionMatrix();
    state.camera.lookAt(cameraTargetRef.current);
  });

  const stageState = getStageFromProgress(scrollProgress);

  return (
    <>
      <color attach="background" args={["#020406"]} />
      <fog attach="fog" args={["#020406", 13, 24]} />
      <ambientLight intensity={0.78} />
      <hemisphereLight intensity={0.54} color="#ffffff" groundColor="#100707" />
      <directionalLight
        position={[6, 10, 7]}
        intensity={1.58}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
      />
      <spotLight position={[-7, 9, 11]} intensity={1.85} angle={0.4} penumbra={0.8} color="#6eb1ff" />
      <spotLight position={[5, 6, 7]} intensity={1.1} angle={0.5} penumbra={0.9} color="#ff685d" />

      <TowerStructure stageState={stageState} />
      <ContactShadows position={[0, -4.58, 0]} opacity={0.24} scale={16} blur={1.4} far={7.5} resolution={256} frames={1} />
    </>
  );
}

export default function InteractiveTowerCanvas({ scrollProgress = 0 }) {
  return (
    <Canvas
      dpr={[1, 1.4]}
      shadows
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: stageStates.observe.camera, fov: 36, near: 0.1, far: 100 }}
    >
      <Suspense fallback={null}>
        <TowerRig scrollProgress={scrollProgress} />
      </Suspense>
    </Canvas>
  );
}
