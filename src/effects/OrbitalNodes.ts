import * as THREE from 'three';
import { PALETTE } from '../config';
import { shaders } from '../shaders';
import { damp, TAU } from '../utils/MathUtils';

export interface OrbitalNodeDefinition {
  id: string;
  label: string;
  detail: string;
}

export const ORBITAL_NODE_DEFINITIONS: OrbitalNodeDefinition[] = [
  { id: 'CORE', label: 'CORE', detail: 'REACTOR OUTPUT' },
  { id: 'VISION', label: 'VISION', detail: 'OPTICAL INPUT' },
  { id: 'AUDIO', label: 'AUDIO', detail: 'ACOUSTIC ARRAY' },
  { id: 'SYSTEM', label: 'SYSTEM', detail: 'KERNEL STATUS' },
  { id: 'DATA', label: 'DATA', detail: 'MEMORY LATTICE' },
  { id: 'NETWORK', label: 'NETWORK', detail: 'UPLINK' },
];

const BASE_RADIUS = 2.85;
const SELECTED_RADIUS = 2.15;
const HOVER_DISTANCE = 0.42;

interface NodeInstance {
  definition: OrbitalNodeDefinition;
  group: THREE.Group;
  ring: THREE.Mesh;
  label: THREE.Sprite;
  uniforms: Record<string, THREE.IUniform>;
  basePosition: THREE.Vector3;
  hover: number;
  selected: boolean;
  radius: number;
  phase: number;
}

function createLabelSprite(text: string): { sprite: THREE.Sprite; texture: THREE.Texture; material: THREE.SpriteMaterial } {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '600 30px "Rajdhani", "Eurostile", "Roboto Mono", monospace';
    ctx.fillStyle = '#bff6ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // letterSpacing is widely supported but still missing from some lib.dom versions.
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '4px';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.0,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.52, 0.13, 1);
  return { sprite, texture, material };
}

/**
 * Interactive holographic nodes orbiting the core. The fingertip cursor can
 * hover them, and a pinch while hovering selects one — the selected node draws
 * in towards the orb and stays lit.
 */
export class OrbitalNodes {
  readonly group = new THREE.Group();

  private readonly nodes: NodeInstance[] = [];
  private readonly link: THREE.Line;
  private readonly linkPositions = new Float32Array(6);
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly tmp = new THREE.Vector3();
  private hovered: NodeInstance | null = null;
  private wasPinching = false;
  private visibility = 0;
  private targetVisibility = 0;

  onSelect: ((node: OrbitalNodeDefinition) => void) | null = null;
  onHover: ((node: OrbitalNodeDefinition | null) => void) | null = null;

  constructor() {
    this.group.name = 'orbital-nodes';

    ORBITAL_NODE_DEFINITIONS.forEach((definition, index) => {
      const count = ORBITAL_NODE_DEFINITIONS.length;
      const angle = (index / count) * TAU - Math.PI * 0.5;
      // Alternate the elevation so the ring of nodes reads as a 3D shell.
      const elevation = Math.sin(angle * 2) * 0.55 + (index % 2 === 0 ? 0.18 : -0.24);

      const basePosition = new THREE.Vector3(
        Math.cos(angle) * BASE_RADIUS,
        elevation,
        Math.sin(angle) * BASE_RADIUS * 0.42,
      );

      const uniforms: Record<string, THREE.IUniform> = {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(PALETTE.cyan) },
        uWarmColor: { value: new THREE.Color(PALETTE.amber) },
        uWarm: { value: 0 },
        uOpacity: { value: 0.6 },
        uEnergy: { value: 0.5 },
        uInner: { value: 0.075 },
        uOuter: { value: 0.095 },
        uFeather: { value: 0.006 },
        uSegments: { value: 8 },
        uDashRatio: { value: 0.6 },
        uSegmentSpin: { value: 0.25 },
        uSweep: { value: 0 },
        uSweepSpeed: { value: 0 },
        uSweepWidth: { value: 0.2 },
        uGapStart: { value: 0 },
        uGapSize: { value: 0 },
      };

      const geometry = new THREE.RingGeometry(0.06, 0.11, 64, 1);
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: shaders.hologram.vert,
        fragmentShader: shaders.hologram.frag,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });

      const ring = new THREE.Mesh(geometry, material);
      ring.frustumCulled = false;

      const { sprite, texture, material: spriteMaterial } = createLabelSprite(definition.label);
      sprite.position.set(0, -0.17, 0);

      const nodeGroup = new THREE.Group();
      nodeGroup.position.copy(basePosition);
      nodeGroup.add(ring);
      nodeGroup.add(sprite);
      this.group.add(nodeGroup);

      this.nodes.push({
        definition,
        group: nodeGroup,
        ring,
        label: sprite,
        uniforms,
        basePosition,
        hover: 0,
        selected: false,
        radius: BASE_RADIUS,
        phase: index * 1.7,
      });

      this.disposables.push(geometry, material, texture, spriteMaterial);
    });

    const linkGeometry = new THREE.BufferGeometry();
    linkGeometry.setAttribute('position', new THREE.BufferAttribute(this.linkPositions, 3));
    const linkMaterial = new THREE.LineBasicMaterial({
      color: PALETTE.iceBlue,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.link = new THREE.Line(linkGeometry, linkMaterial);
    this.link.frustumCulled = false;
    this.link.renderOrder = 11;
    this.group.add(this.link);
    this.disposables.push(linkGeometry, linkMaterial);

    this.group.visible = false;
  }

  setVisible(visible: boolean): void {
    this.targetVisibility = visible ? 1 : 0;
  }

  get hoveredNode(): OrbitalNodeDefinition | null {
    return this.hovered?.definition ?? null;
  }

  get selectedNode(): OrbitalNodeDefinition | null {
    const selected = this.nodes.find((node) => node.selected);
    return selected?.definition ?? null;
  }

  /**
   * @param cursor world-space fingertip position, or null when not pointing
   * @param pinching whether the pointing hand is currently pinching
   */
  update(
    dt: number,
    time: number,
    cursor: THREE.Vector3 | null,
    pinching: boolean,
    cameraQuaternion: THREE.Quaternion,
  ): void {
    this.visibility = damp(this.visibility, this.targetVisibility, 6, dt);
    this.group.visible = this.visibility > 0.02;
    if (!this.group.visible) {
      this.wasPinching = pinching;
      return;
    }

    let nearest: NodeInstance | null = null;
    let nearestDistance = Infinity;

    if (cursor) {
      for (const node of this.nodes) {
        const distance = node.group.position.distanceTo(cursor);
        if (distance < HOVER_DISTANCE && distance < nearestDistance) {
          nearest = node;
          nearestDistance = distance;
        }
      }
    }

    if (nearest !== this.hovered) {
      this.hovered = nearest;
      this.onHover?.(nearest?.definition ?? null);
    }

    // Rising edge of a pinch while hovering = selection.
    if (pinching && !this.wasPinching && this.hovered) {
      for (const node of this.nodes) node.selected = node === this.hovered;
      this.onSelect?.(this.hovered.definition);
    }
    this.wasPinching = pinching;

    for (const node of this.nodes) {
      const isHovered = node === this.hovered;
      node.hover = damp(node.hover, isHovered ? 1 : 0, 9, dt);

      const targetRadius = node.selected ? SELECTED_RADIUS : BASE_RADIUS;
      node.radius = damp(node.radius, targetRadius, 4, dt);

      const scale = node.radius / BASE_RADIUS;
      this.tmp.copy(node.basePosition).multiplyScalar(scale);
      // A gentle bob keeps the ring of nodes from looking pinned in place.
      this.tmp.y += Math.sin(time * 0.6 + node.phase) * 0.035;
      node.group.position.copy(this.tmp);
      node.group.quaternion.copy(cameraQuaternion);
      node.group.scale.setScalar((1 + node.hover * 0.45) * (0.85 + this.visibility * 0.15));

      node.uniforms.uTime.value = time;
      node.uniforms.uOpacity.value =
        (0.35 + node.hover * 0.6 + (node.selected ? 0.25 : 0)) * this.visibility;
      node.uniforms.uEnergy.value = 0.4 + node.hover * 1.2 + (node.selected ? 0.5 : 0);
      node.uniforms.uWarm.value = node.selected ? 0.65 : node.hover * 0.25;
      node.uniforms.uSegmentSpin.value = 0.25 + node.hover * 1.4;

      (node.label.material as THREE.SpriteMaterial).opacity =
        (0.25 + node.hover * 0.75) * this.visibility;
    }

    /* --- connecting line from the cursor to the hovered node ----------- */
    const linkMaterial = this.link.material as THREE.LineBasicMaterial;
    if (cursor && this.hovered) {
      this.linkPositions[0] = cursor.x;
      this.linkPositions[1] = cursor.y;
      this.linkPositions[2] = cursor.z;
      this.linkPositions[3] = this.hovered.group.position.x;
      this.linkPositions[4] = this.hovered.group.position.y;
      this.linkPositions[5] = this.hovered.group.position.z;
      this.link.geometry.attributes.position.needsUpdate = true;
      linkMaterial.opacity = damp(linkMaterial.opacity, 0.75 * this.visibility, 12, dt);
    } else {
      linkMaterial.opacity = damp(linkMaterial.opacity, 0, 12, dt);
    }
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose();
  }
}
