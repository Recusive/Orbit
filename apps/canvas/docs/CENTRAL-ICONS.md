# Central Icons React

Documentation for using the Central Icons React icon library in Orbit Canvas.

## License

The license key is stored securely in the team's password manager.
**Never commit license keys to the repository.**

```
# Set this environment variable before installing:
CENTRAL_LICENSE_KEY=<your-license-key>
```

## Installation

The license key must be set as an environment variable when installing:

```bash
# First, set your license key (get from team password manager)
export CENTRAL_LICENSE_KEY="<your-license-key>"

# Install the "all" package (contains CentralIcon component with all variants)
CENTRAL_LICENSE_KEY="$CENTRAL_LICENSE_KEY" npm i @central-icons-react/all

# Install a specific variant package (smaller bundle, tree-shakeable)
CENTRAL_LICENSE_KEY="$CENTRAL_LICENSE_KEY" npm i @central-icons-react/round-outlined-radius-1-stroke-2
```

## Usage

### Option 1: Specific Variant Package (Recommended)

Import individual icons from variant-specific packages for optimal tree-shaking:

```tsx
import { IconLayoutAlignLeft } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconLayoutAlignLeft';

function MyComponent() {
  return <IconLayoutAlignLeft size={16} />;
}
```

### Option 2: All Package with CentralIcon

Use the `CentralIcon` component from the `all` package:

```tsx
import { CentralIcon } from '@central-icons-react/all';

function MyComponent() {
  return (
    <CentralIcon
      name="IconLayoutAlignLeft"
      join="round"
      fill="outlined"
      radius="2"
      stroke="1.5"
      size={16}
    />
  );
}
```

## Package Naming Convention

Variant packages follow this pattern:

```
@central-icons-react/{join}-{fill}-radius-{radius}-stroke-{stroke}
```

### Available Values

| Property | Values               |
| -------- | -------------------- |
| `join`   | `round`, `square`    |
| `fill`   | `filled`, `outlined` |
| `radius` | `0`, `1`, `2`, `3`   |
| `stroke` | `1`, `1.5`, `2`      |

### Example Packages

- `@central-icons-react/round-outlined-radius-1-stroke-2`
- `@central-icons-react/round-outlined-radius-2-stroke-1.5`
- `@central-icons-react/square-filled-radius-0-stroke-1`

## Props

All icons accept standard SVG props plus:

| Prop         | Type               | Description                  |
| ------------ | ------------------ | ---------------------------- |
| `size`       | `string \| number` | Icon size (width and height) |
| `ariaHidden` | `boolean`          | Set aria-hidden attribute    |

## Currently Installed Packages

- `@central-icons-react/all` - Full package with CentralIcon component

## Resources

- Central Icons website: https://centralicons.com
