import * as THREE from 'three';
import { PALETTE } from '../config';
import { HAND_CONNECTIONS, LANDMARK_COUNT } from '../vision/types';

/**
 * Glowing 3D hand skeleton, shown only in debug mode.
 * One InstancedMesh for all joints, one LineSegments for all bones.
 */
export class HandSkeleton {
  readonly group = new THREE.Group();

  private readonly joints: THREE.InstancedMesh;
  private readonly bones: THREE.LineSegments;
  private readonly bonePositions: Float32Array;
  private readonly dummy = new THREE.Object3D();
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly maxHands: number;

  constructor(maxHands = 2) {
    this.maxHands = maxHands;
    this.group.name = 'hand-skeleton';
    this.group.visible = false;

    const jointGeometry = new THREE.SphereGeometry(0.028, 10, 8);
    const jointMaterial = new THREE.MeshBasicMaterial({
      color: PALETTE.iceBlue,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.joints = new THREE.InstancedMesh(jointGeometry, jointMaterial, LANDMARK_COUNT * maxHands);
    this.joints.frustumCulled = false;
    this.joints.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.joints.count = 0;
    this.group.add(this.joints);
    this.disposables.push(jointGeometry, jointMaterial);

    this.bonePositions = new Float32Array(HAND_CONNECTIONS.length * 2 * 3 * maxHands);
    const boneGeometry = new THREE.BufferGeometry();
    boneGeometry.setAttribute('position', new THREE.BufferAttribute(this.bonePositions, 3));
    const boneMaterial = new THREE.LineBasicMaterial({
      color: PALETTE.cyan,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.bones = new THREE.LineSegments(boneGeometry, boneMaterial);
    this.bones.frustumCulled = false;
    this.group.add(this.bones);
    this.disposables.push(boneGeometry, boneMaterial);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  /** @param hands world-space landmark positions, one array of 21 per hand */
  update(hands: Array<THREE.Vector3[] | null>): void {
    if (!this.group.visible) return;

    let jointIndex = 0;
    let boneVertex = 0;

    for (let h = 0; h < this.maxHands; h++) {
      const landmarks = hands[h];
      if (!landmarks || landmarks.length < LANDMARK_COUNT) continue;

      for (let i = 0; i < LANDMARK_COUNT; i++) {
        this.dummy.position.copy(landmarks[i]);
        // Fingertips are drawn slightly larger so they are easy to identify.
        const isTip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
        this.dummy.scale.setScalar(isTip ? 1.5 : 1);
        this.dummy.updateMatrix();
        this.joints.setMatrixAt(jointIndex++, this.dummy.matrix);
      }

      for (const [a, b] of HAND_CONNECTIONS) {
        const from = landmarks[a];
        const to = landmarks[b];
        this.bonePositions[boneVertex++] = from.x;
        this.bonePositions[boneVertex++] = from.y;
        this.bonePositions[boneVertex++] = from.z;
        this.bonePositions[boneVertex++] = to.x;
        this.bonePositions[boneVertex++] = to.y;
        this.bonePositions[boneVertex++] = to.z;
      }
    }

    this.joints.count = jointIndex;
    this.joints.instanceMatrix.needsUpdate = true;

    // Collapse any unused bone vertices to the origin rather than leaving stale data.
    for (let i = boneVertex; i < this.bonePositions.length; i++) this.bonePositions[i] = 0;
    this.bones.geometry.setDrawRange(0, boneVertex / 3);
    this.bones.geometry.attributes.position.needsUpdate = true;
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose();
  }
}
