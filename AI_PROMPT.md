# Collaborative AI Prompt: Celestial Lattice Elastic-Scattering Simulator

You are collaborating on a computational-physics visualization project that will be hosted as a public GitHub repository and deployed through GitHub Pages.

The goal is to build a mathematically correct, computationally efficient, visually clear browser simulation of a projectile moving through a finite approximation of an infinite regular lattice of spherical scatterers.

## Problem definition

Consider a 3D cubic lattice of identical spherical scatterers with center-to-center spacing `a`. The ideal lattice is infinite, but use a finite cubic region with lattice half-extent `H` for computation and visualization.

A projectile sphere starts at the origin with speed `v`. Its initial direction is parameterized by `theta` in the x-y plane:

`v0 = v [cos(theta), sin(theta), 0]`

The lattice spheres are fixed in space and do not move after impact. This is therefore a fixed-scatterer / Lorentz-gas-style transport problem rather than a two-free-body collision problem.

Let:

- `Ro` = lattice-sphere radius
- `Rp` = projectile radius
- `R = Ro + Rp` = effective collision radius

A collision occurs when the projectile center reaches distance `R` from a lattice-sphere center.

At collision, let `n` be the outward unit normal from the lattice-sphere center toward the projectile center. The projectile velocity is reflected according to:

`v_after = v_before - 2 (v_before · n) n`

The primary observable is the projectile position immediately after its `N`th collision, with `N = 100` as the default target.

## Required assumptions

- Lattice spacing is exactly `a` in x, y and z.
- Lattice spheres are fixed.
- Collisions are perfectly elastic and frictionless.
- No gravity is included in the first version.
- No drag or other external force is included.
- The projectile starts at the origin.
- Use a lattice phase offset so the projectile does not initially overlap a lattice sphere.
- The first implementation uses a cubic lattice.
- The finite lattice is only an approximation to the infinite lattice.

## Critical physical distinction

Do not use a two-body elastic-collision formula involving the masses of the projectile and lattice sphere. The lattice spheres are explicitly fixed.

The collision is a specular reflection from a rigid spherical surface.

Do not introduce randomness into the collision direction. Any apparently random trajectory must emerge deterministically from the lattice geometry and initial conditions.

## Numerical method

Do not brute-force every lattice sphere after every collision.

Use the regular lattice as a spatial acceleration structure:

1. Traverse lattice cells using an Amanatides-Woo-style 3D DDA traversal.
2. At each traversed cell, test only a constant-size local neighborhood such as a `3 × 3 × 3` set of nearby lattice centers.
3. For every candidate sphere, solve the ray-sphere intersection analytically.
4. Select the smallest valid positive intersection distance.
5. Compute the exact collision point.
6. Compute the collision normal.
7. Apply the specular elastic reflection equation.
8. Apply a tiny outward numerical offset to avoid immediate self-recollision.
9. Repeat until `N` collisions are reached or the projectile exits the finite lattice.

### Complexity target

For `K` collisions and `Ci` grid cells traversed by each free-flight segment:

`Physics = O(sum(Ci))`

Candidate testing per traversed cell must remain constant-sized.

Recorded event storage:

`O(K)`

Explicitly rendered lattice instances:

`O(H^3)`

The renderer should use GPU instancing rather than thousands of independent mesh objects.

## Browser implementation

Use browser-native WebGL, preferably Three.js.

Keep these concerns separated:

- physics/collision kernel
- simulation state
- rendering
- UI/control layer

The physics kernel must remain deterministic and independent from the rendering layer so it can later be moved into:

- Web Worker
- WebAssembly
- GPU compute

without rewriting the application architecture.

## Required visualization

Show:

- 3D spherical lattice
- projectile sphere
- complete collision trajectory
- collision markers
- current projectile location
- orbit/zoom camera controls

Controls:

- lattice spacing `a`
- obstacle radius
- projectile radius
- speed `v`
- angle `theta`
- collision count `N`
- lattice half-extent `H`
- animation speed

Statistics:

- collision count completed
- current/end `(x,y,z)` position
- current speed
- cumulative flight time
- maximum speed-conservation error
- termination status

## Numerical validation

Implement checks for:

- `|v_after| - |v_before|` near machine precision
- invalid geometry where `Ro + Rp >= a/2`
- grazing collisions
- duplicate collision prevention
- finite-lattice exit
- exact collision indexing

For research-grade development, provide a future test path comparing the accelerated solver against a simple brute-force reference solver on small lattices.

## GitHub requirements

The project must be ready to publish as a GitHub repository.

Include:

- clear `README.md`
- `.gitignore`
- GitHub Pages deployment workflow under `.github/workflows/`
- academic citation metadata where useful
- no backend requirement
- reproducible run instructions
- mathematical model documentation
- complexity analysis
- numerical-stability discussion
- deployment instructions

The application should work from the repository root on GitHub Pages without requiring a server-side runtime.

## Future extensions

Design for later additions including:

- inverse-square gravity
- moving lattice bodies
- inelastic collisions
- multiple particle masses/species
- thermal velocity distributions
- lattice defects and vacancies
- FCC, BCC and HCP lattices
- electric and magnetic fields
- relativistic corrections
- millions of collisions
- statistical mean free path analysis
- angular-distribution analysis
- diffusion behavior
- sensitivity / Lyapunov-like trajectory analysis
- CSV/JSON trajectory export
- Web Worker / WASM / GPU acceleration

## Deliverables

Produce:

1. Complete runnable source code.
2. GitHub-ready repository structure.
3. GitHub Pages deployment configuration.
4. Mathematical model explanation.
5. Complexity analysis.
6. Numerical-stability discussion.
7. Reproducibility instructions.
8. A clear explanation of which assumptions are approximations.
9. A concise academic description suitable for a professor reviewing the project.

Do not replace exact collision geometry with arbitrary random direction changes.

The central requirement is deterministic physics, efficient collision detection, and a visually convincing 3D representation that can scale to substantially more than 100 collisions in later versions.
