import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Center, ContactShadows, Float, Sparkles, useGLTF, useTexture } from "@react-three/drei";
import { Color, MeshStandardMaterial, RepeatWrapping } from "three";

function TowerModel() {
  const groupRef = useRef(null);
  const { scene } = useGLTF("/assets/tower/radiotower.glb");
  const model = useMemo(() => scene.clone(), [scene]);
  const roughnessMap = useTexture("/assets/tower/grass-roughness.png");
  const metallicMap = useTexture("/assets/tower/grass-metallic.png");

  useLayoutEffect(() => {
    [roughnessMap, metallicMap].forEach((texture) => {
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.repeat.set(8, 8);
    });
  }, [metallicMap, roughnessMap]);

  useLayoutEffect(() => {
    model.traverse((child) => {
      if (!child.isMesh) return;

      child.castShadow = true;
      child.receiveShadow = true;

      if (child.name.includes("Plane")) {
        child.material = new MeshStandardMaterial({
          color: new Color("#29553d"),
          roughness: 0.94,
          metalness: 0.08,
          roughnessMap,
          metalnessMap: metallicMap,
        });
        return;
      }

      child.material = new MeshStandardMaterial({
        color: new Color("#d8dde7"),
        metalness: 0.52,
        roughness: 0.42,
        emissive: new Color("#0f2742"),
        emissiveIntensity: child.name.includes("Cylinder.014") ? 0.28 : 0.04,
      });
    });
  }, [metallicMap, model, roughnessMap]);

  useFrame((state) => {
    if (!groupRef.current) return;

    const elapsed = state.clock.getElapsedTime();
    const pointerYaw = state.pointer.x * 0.1;
    const pointerPitch = state.pointer.y * 0.04;

    groupRef.current.rotation.y = -0.18 + pointerYaw + Math.sin(elapsed * 0.28) * 0.05;
    groupRef.current.rotation.x = 0.02 + pointerPitch;
    groupRef.current.position.y = -1.85 + Math.sin(elapsed * 0.9) * 0.04;
  });

  return (
    <Float speed={0.85} rotationIntensity={0.03} floatIntensity={0.1}>
      <Center scale={0.72} position={[0, -1.85, 0]}>
        <primitive ref={groupRef} object={model} />
      </Center>
    </Float>
  );
}

function CameraRig() {
  useFrame((state) => {
    const x = state.pointer.x * 0.34;
    const y = state.pointer.y * 0.16;
    state.camera.position.x += (x - state.camera.position.x) * 0.03;
    state.camera.position.y += (5.6 + y - state.camera.position.y) * 0.03;
    state.camera.lookAt(0, 4.8, 0);
  });

  return null;
}

export default function LoginTowerCanvas() {
  return (
    <div className="h-full w-full">
      <Canvas
        shadows
        dpr={[1, 1.6]}
        camera={{ position: [1.15, 5.6, 8.25], fov: 21 }}
        gl={{ antialias: true, alpha: true }}
      >
        <fog attach="fog" args={["#08131e", 12, 26]} />
        <ambientLight intensity={0.96} color="#d8e7ff" />
        <directionalLight
          position={[7, 15, 9]}
          intensity={2.8}
          color="#f2f7ff"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <spotLight position={[-7, 10, 8]} intensity={1.5} angle={0.34} penumbra={0.7} color="#2997ff" />
        <spotLight position={[0, 14, -2]} intensity={1.15} angle={0.25} penumbra={0.8} color="#60f0c8" />
        <pointLight position={[0, 2.5, 7]} intensity={0.38} color="#f4f8ff" />
        <Suspense fallback={null}>
          <TowerModel />
        </Suspense>
        <Sparkles count={6} scale={[12, 10, 8]} size={1.1} speed={0.16} color="#7ebdff" />
        <ContactShadows position={[0, -2.45, 0]} opacity={0.46} scale={19} blur={2.8} far={7} color="#091018" />
        <CameraRig />
      </Canvas>
    </div>
  );
}

useGLTF.preload("/assets/tower/radiotower.glb");
