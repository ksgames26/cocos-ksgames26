# ksgames26

`ksgames26` is a consolidated extension package for Cocos Creator `3.8.7+`. It combines both editor-side tooling and runtime framework code in a single package.

It contains two major parts:

- Editor extension features: panels, menus, inspector extensions, hierarchy menu hooks, scene extensions, asset menu hooks, i18n config parsing and watching, and template generation.
- Runtime framework features: mounted through `asset-db` and exposed as `db://ksgames26/*`, including UI, scene, task, asset, audio, i18n, state machine, protobuf, Colyseus, and common utility modules.

This repository is no longer the default example extension. It is the integrated single-package form of a larger internal Cocos extension stack.

## Requirements

- Node.js
- Cocos Creator `>= 3.8.7`

## Install And Build

```bash
npm install
npm run build
```

After building:

- Editor extension outputs are generated in `dist/*`
- Runtime source code lives in `game-framework/*`
- Standalone runtime type checking can be done with `tsconfig.game-framework.json`

## Feature Overview

### Editor Features

- `Default Panel`: a Vue 3 based dockable panel used for panel lifecycle and message communication.
- `set-name` panel: an additional dockable panel registered by the extension.
- `Inspector extensions` for:
  - `ViewState`
  - `I18NLabel`
  - `I18NRichText`
  - `I18NSprite`
- `Scene extension`: registers scene-side extension logic.
- `Hierarchy menu`: custom root-node and node context menus.
- `Assets menu`: custom asset-db menu integration.
- `Project profile settings`: stores i18n file path, parse range, default locale, and related options.
- `i18n config watcher`: parses `xlsx`, `xls`, and `csv` files and reloads when the config file changes.
- `Template generation`: exposes a menu command that triggers `create_template`.

### Runtime Features

Runtime code is mounted as:

```ts
db://ksgames26/*
```

The unified runtime entry is:

```ts
import { UIService, SceneService, TaskService } from "db://ksgames26/game-framework";
```

Main exported runtime areas include:

- `core`: container, logging, event dispatcher, task primitives, decorators, and general helpers.
- `services`: `AssetService`, `AudioService`, `ConfService`, `SceneService`, `TaskService`, `UIService`, and `PalService`.
- `model-view`: `BaseService`, `BaseView`, `BaseViewComponent`, `ViewLock`, `ViewState`, and a set of reusable UI components.
- `i18n`: `I18NLabel`, `I18NRichText`, `I18NSprite`, and `I18NService`.
- `protobuf` / `protobuf-ts`: protobuf runtime and message type support.
- `client` / `room` / `colyseus`: networking and room-related runtime support.
- `structures` / `utils` / `intelligence` / `camera`: data structures, timers, state machines, camera helpers, and other utilities.

### `model-view` In Detail

`model-view` is one of the core runtime layers in this framework. It defines a consistent structure for service logic, view prefabs, nested UI components, open-close locking, and animation-driven state switching.

#### 1. Core Abstractions

- `BaseService`
  - Base class for a screen-level or domain-level service
  - Comes with built-in access to `AssetService`, `UIService`, `TaskService`, and `I18NService`
  - Exposes helpers such as `t()`, `h()`, `rpcService()`, `observerValue()`, `setValue()`, and `getValue()`
  - Best suited for UI state, domain events, and cross-service coordination
- `BaseView`
  - Base class for a full screen or popup prefab
  - Holds `service`, `options`, and `args`
  - Unifies close flow, keyboard handling, opacity transition, safe-area binding, and close-after-await behavior
  - Requires subclasses to implement `onClose()`
- `BaseViewComponent`
  - Base class for child components mounted inside a `BaseView`
  - Automatically receives its parent `view` and `service`
  - Supports `asyncBinding`, which is useful for dynamically instantiated prefab fragments
  - Supports self-close, close result waiting, safe-area fixes, and `onShow` completion for late-added nodes

The intended split is:

- `Service` manages state and logic
- `View` manages screen lifecycle
- `ViewComponent` manages local interaction and local node groups

#### 2. State Control

- `state/view-state.ts`
  - Provides the `ViewState` component
  - Uses `Animation` plus `AsyncStateMachine` to drive UI state transitions
  - Works well for tab switching, expand-collapse panels, multi-state buttons, and step-based UI flows driven by animation frames
- Key characteristics
  - supports default state selection
  - supports transition duration calculation
  - supports editor-time preview
  - already has matching inspector integration on the editor side

#### 3. Open Locks And Reuse Control

- `open-lock/view-lock.ts`
  - `ViewLock`
    - Prevents the same view from being opened repeatedly
    - Supports reference-count mode through `enableRefCount`
    - Useful for loading screens, global masks, singleton dialogs, and other shared UI
  - `ViewComponentLock`
    - Prevents the same child prefab component from being appended repeatedly
    - Useful for tooltips, floating panels, and temporary local UI pieces

#### 4. Reusable Components

`components/*` already includes a set of reusable UI building blocks:

- `auto-asset/auto-sprite.ts`
  - auto-binds and releases `SpriteFrame` handles
- `animation/frame-animations.ts`
  - frame animation helper component
- `circle-header/*`
  - circular avatar clipping and remote avatar helpers
- `label/*`
  - `PopupLabel`
  - `SpecialLabel`
  - popup text and custom text rendering support
- `left-right-button.ts`
  - left-right switch button control
- `page-view-plus.ts`
  - enhanced `PageView` wrapper
- `popup/popup-message.ts`
  - common popup message component
- `resizable/*`
  - alignment, resize-to-fit, child-driven layout recalculation, and extended layout behavior
- `scroll-view-plus.ts`
  - enhanced `ScrollView` wrapper
- `rotate-around-circle.ts`
  - circular rotation layout helper
- `super-rich-text.ts`
  - enhanced rich text behavior
- `view-group-nesting.ts`
  - nested view-group support
- `virtual-list/*`
  - virtual list, sticky list, nested scroll config, and grouped list coordination
- `steer/*`
  - joystick related materials and components

#### 5. Recommended Usage Pattern

A practical usage pattern is:

1. Define one `xxxService extends BaseService` for each major screen
2. Attach one `xxxView extends BaseView` to the screen prefab
3. Split complex node groups into `xxxComponent extends BaseViewComponent`
4. Use `ViewLock` for singleton or reusable views
5. Use `ViewState` when the UI has multiple animation-driven states

Benefits of this pattern:

- unified UI lifecycle handling
- less business logic scattered across node scripts
- built-in support for dynamic components and safe-area adaptation
- a good fit for medium to large Cocos projects with layered UI architecture

### `services` In Detail

`services` is the runtime service hub of the framework. It centralizes cross-cutting capabilities such as assets, UI, scenes, tasks, audio, config data, and platform abstraction. In a typical project bootstrap flow, these services are registered into `Container` first, and then consumed by business-level `BaseService` classes.

#### 1. `UIService`

- The main coordinator of the UI system
- Responsible for:
  - opening and closing `BaseView`
  - managing UI layers such as `Root`, `PopUp`, `Top`, `Mid`, and `Bottom`
  - handling `FullScreenView`, `BlackBaseView`, and `TransparentBaseView`
  - maintaining push-pop view stacks
  - dynamically appending `BaseViewComponent`
  - enabling and disabling keyboard handling
- `OpenViewOptions` is the key parameter object and defines:
  - prefab handle
  - animation mode
  - show type
  - view args
  - layer and optional custom layer node
  - explicit view name
  - push-pop behavior

#### 2. `SceneService`

- Manages the full lifecycle of 3D scenes or large scene contexts
- Core responsibilities:
  - loading scene prefabs
  - preloading scene assets
  - creating and destroying 3D roots
  - switching scenes
  - auto-opening scene-level UI
  - driving `SceneController` lifecycle callbacks
- Built-in phase flow:
  - `None -> Loading -> Loaded -> Entering -> Running -> Exiting -> Exited -> Destroyed`
- A good fit for lobby, battle, room, or map-driven project structures

#### 3. `AssetService`

- Centralized asset loading, caching, reference counting, and releasing
- Built around the `AssetHandle` abstraction
- `AssetHandle` is responsible for:
  - tracking bundle, path, and type
  - maintaining reference counts
  - providing safe loading
  - releasing assets when references drop to zero
- Supported scenarios include:
  - normal bundle assets
  - directory assets
  - remote image assets
  - prefab-related asset ownership flow
- This service is the foundation for `UIService`, `AudioService`, and i18n asset loading

#### 4. `TaskService`

- Manages sync tasks, async tasks, and awaitable task handles
- Useful for:
  - waiting for next frame
  - sequential task scheduling
  - async flow composition
  - interruptible or observable task execution
- `TaskHandle` provides:
  - promise-based waiting
  - completion events
  - auto recycling
  - optional logging
- It is commonly used in view animation, async binding, preload flow, and timing control

#### 5. `AudioService`

- Manages background music and sound effects
- Features:
  - creates a dedicated audio root node
  - supports persistent nodes
  - separates BGM and SFX
  - keeps an internal effect source pool
  - loads `AudioClip` through `AssetService`
  - supports independent music and effect volume control
- It is suitable as a global singleton-style audio manager

#### 6. `ConfService`

- Parses binary configuration tables at runtime
- Depends on `Byte` and `IGameFramework.ISerializable` to decode config payloads
- Current supported packing types include:
  - single object `KV`
  - list `LIST`
  - map `MAP`
- It is suitable for consuming planner-exported binary config data and exposing structured runtime config access

#### 7. `PalService`

- `Pal` can be understood as the platform abstraction layer
- It encapsulates platform login, account logic, and host-environment differences
- Uses `IPal` and `ILoginAdapter` as abstraction contracts
- Default implementations include:
  - `EmptyPal`
  - `DefaultPal`
- Typical responsibilities:
  - login
  - logout
  - retrieving platform `openId`
  - injecting custom platform implementations

#### 8. How They Work Together

A practical mental model is:

- `AssetService` provides the resource foundation
- `UIService` manages views on top of the asset layer
- `SceneService` manages scene contexts on top of assets and UI
- `AudioService` plays audio on top of the asset layer
- `TaskService` provides timing and flow control for UI, scenes, and loading
- `ConfService` provides structured runtime config data
- `PalService` abstracts platform and login behavior
- `BaseService` composes these foundational services into business-facing service objects

#### 9. Recommended Initialization Order

A common startup order is:

1. `AssetService`
2. `TaskService`
3. `UIService`
4. `SceneService`
5. `AudioService`
6. `ConfService`
7. `PalService`

With this order, most dependencies are already ready when later business services call `Container.get(...)`.

## Project Structure

```text
ksgames26/
|- source/              editor extension source
|- dist/                built editor extension output
|- game-framework/      runtime framework source, mounted as db://ksgames26/*
|- static/              panel templates and styles
|- i18n/                extension i18n resources
|- package.json         extension registration and contribution config
|- tsconfig.json        editor extension build config
|- tsconfig.game-framework.json  standalone runtime type-check config
```

## Common Entry Points

After enabling the extension, the main features are available from:

- `Panel -> ksgames26 -> Default Panel`
- `Developer -> ksgames26 -> Send Message to Panel`
- `ksgames26/game-framework -> Create Template`
- `ksgames26/game-framework -> i18n related refresh or watch entries`

In particular:

- `open-panel` opens the default panel.
- `send-to-panel` sends a message to the default panel and invokes its `hello` method.
- `create_template` runs the template generation logic from the extension main process.

## i18n Workflow

The extension reads the following project-level configuration:

- i18n config file path
- parse start row and column
- parse end row and column
- default locale

Supported input formats:

- `xlsx`
- `xls`
- `csv`

After parsing, the extension can provide:

- localized text preview for inspector fields
- sprite resource path resolution
- atlas spriteFrame resolution
- automatic refresh after config file changes

## Development Notes

- Rebuild the editor extension with `npm run build`
- Type-check the runtime framework independently with:

```bash
npx tsc -p tsconfig.game-framework.json
```

- Internal files inside `game-framework` should prefer relative imports
- External project code should prefer importing from `db://ksgames26/game-framework`

## Typical Use Cases

This package can be used as:

- a base runtime framework for Cocos Creator projects
- a UI / Scene / Service layered architecture starter
- an editor-side i18n toolchain
- protobuf / Colyseus integration infrastructure
- a single-package distribution form for a team's internal extension stack
