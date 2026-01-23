/**
 * Component Templates for Code-First Canvas
 *
 * When a user selects a component from the menu, we create a SandpackNode
 * pre-filled with template code for that component type.
 */

export type ComponentType =
  | 'button'
  | 'input'
  | 'textarea'
  | 'checkbox'
  | 'radio'
  | 'select'
  | 'toggle'
  | 'form'
  | 'container'
  | 'card'
  | 'text'
  | 'image'
  | 'link'
  | 'divider'
  | 'badge'
  | 'sandpack'; // Custom/empty template

/**
 * Returns the template code for a given component type.
 * All templates are complete, self-contained React components.
 */
export function getComponentTemplate(type: ComponentType): string {
  const templates: Record<ComponentType, string> = {
    button: `export default function App() {
	return (
		<button
			className="px-4 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors"
			onClick={() => { /* handle click */ }}
		>
			Click Me
		</button>
	);
}`,

    input: `export default function App() {
	const [value, setValue] = React.useState('');

	return (
		<div className="w-full max-w-sm">
			<label className="block text-sm font-medium text-gray-700 mb-1">
				Email
			</label>
			<input
				type="email"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				placeholder="Enter your email"
				className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
			/>
		</div>
	);
}`,

    textarea: `export default function App() {
	const [value, setValue] = React.useState('');

	return (
		<div className="w-full max-w-md">
			<label className="block text-sm font-medium text-gray-700 mb-1">
				Message
			</label>
			<textarea
				value={value}
				onChange={(e) => setValue(e.target.value)}
				placeholder="Enter your message..."
				rows={4}
				className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
			/>
		</div>
	);
}`,

    checkbox: `export default function App() {
	const [checked, setChecked] = React.useState(false);

	return (
		<label className="flex items-center gap-2 cursor-pointer">
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => setChecked(e.target.checked)}
				className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
			/>
			<span className="text-sm text-gray-700">
				I agree to the terms and conditions
			</span>
		</label>
	);
}`,

    radio: `export default function App() {
	const [selected, setSelected] = React.useState('option1');

	const options = [
		{ value: 'option1', label: 'Option 1' },
		{ value: 'option2', label: 'Option 2' },
		{ value: 'option3', label: 'Option 3' },
	];

	return (
		<div className="space-y-2">
			{options.map((option) => (
				<label key={option.value} className="flex items-center gap-2 cursor-pointer">
					<input
						type="radio"
						name="options"
						value={option.value}
						checked={selected === option.value}
						onChange={(e) => setSelected(e.target.value)}
						className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
					/>
					<span className="text-sm text-gray-700">{option.label}</span>
				</label>
			))}
		</div>
	);
}`,

    select: `export default function App() {
	const [value, setValue] = React.useState('');

	const options = [
		{ value: '', label: 'Select an option' },
		{ value: 'react', label: 'React' },
		{ value: 'vue', label: 'Vue' },
		{ value: 'angular', label: 'Angular' },
		{ value: 'svelte', label: 'Svelte' },
	];

	return (
		<div className="w-full max-w-xs">
			<label className="block text-sm font-medium text-gray-700 mb-1">
				Framework
			</label>
			<select
				value={value}
				onChange={(e) => setValue(e.target.value)}
				className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
			>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</div>
	);
}`,

    toggle: `export default function App() {
	const [enabled, setEnabled] = React.useState(false);

	return (
		<label className="flex items-center gap-3 cursor-pointer">
			<button
				role="switch"
				aria-checked={enabled}
				onClick={() => setEnabled(!enabled)}
				className={\`relative inline-flex h-6 w-11 items-center rounded-full transition-colors \${
					enabled ? 'bg-blue-600' : 'bg-gray-200'
				}\`}
			>
				<span
					className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${
						enabled ? 'translate-x-6' : 'translate-x-1'
					}\`}
				/>
			</button>
			<span className="text-sm text-gray-700">
				{enabled ? 'Enabled' : 'Disabled'}
			</span>
		</label>
	);
}`,

    form: `export default function App() {
	const [formData, setFormData] = React.useState({
		name: '',
		email: '',
	});

	const handleSubmit = (e) => {
		e.preventDefault();
		alert('Form submitted!');
	};

	return (
		<form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
			<div>
				<label className="block text-sm font-medium text-gray-700 mb-1">
					Name
				</label>
				<input
					type="text"
					value={formData.name}
					onChange={(e) => setFormData({ ...formData, name: e.target.value })}
					className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
					required
				/>
			</div>
			<div>
				<label className="block text-sm font-medium text-gray-700 mb-1">
					Email
				</label>
				<input
					type="email"
					value={formData.email}
					onChange={(e) => setFormData({ ...formData, email: e.target.value })}
					className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
					required
				/>
			</div>
			<button
				type="submit"
				className="w-full px-4 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors"
			>
				Submit
			</button>
		</form>
	);
}`,

    container: `export default function App() {
	return (
		<div className="flex flex-col gap-4 p-6 bg-gray-50 rounded-lg">
			<div className="p-4 bg-white rounded-lg shadow-sm">
				Item 1
			</div>
			<div className="p-4 bg-white rounded-lg shadow-sm">
				Item 2
			</div>
			<div className="p-4 bg-white rounded-lg shadow-sm">
				Item 3
			</div>
		</div>
	);
}`,

    card: `export default function App() {
	return (
		<div className="w-full max-w-sm bg-white rounded-lg shadow-lg overflow-hidden">
			<div className="h-48 bg-gradient-to-r from-blue-500 to-purple-600" />
			<div className="p-6">
				<h3 className="text-xl font-semibold text-gray-900 mb-2">
					Card Title
				</h3>
				<p className="text-gray-600 mb-4">
					This is a description of the card content. It can contain multiple lines of text.
				</p>
				<button className="px-4 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors">
					Learn More
				</button>
			</div>
		</div>
	);
}`,

    text: `export default function App() {
	return (
		<div className="space-y-4">
			<h1 className="text-3xl font-bold text-gray-900">
				Heading Text
			</h1>
			<p className="text-lg text-gray-600 leading-relaxed">
				This is a paragraph of text. You can edit this to display any content you need.
				The text will automatically wrap and flow within its container.
			</p>
		</div>
	);
}`,

    image: `export default function App() {
	return (
		<div className="w-full max-w-md">
			<img
				src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop"
				alt="Mountain landscape"
				className="w-full h-auto rounded-lg shadow-lg"
			/>
			<p className="mt-2 text-sm text-gray-500 text-center">
				A beautiful mountain landscape
			</p>
		</div>
	);
}`,

    link: `export default function App() {
	return (
		<a
			href="https://example.com"
			target="_blank"
			rel="noopener noreferrer"
			className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline transition-colors"
		>
			Visit Website
			<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
			</svg>
		</a>
	);
}`,

    divider: `export default function App() {
	return (
		<div className="w-full max-w-md">
			<p className="text-gray-600 mb-4">Content above the divider</p>
			<hr className="border-t border-gray-300 my-4" />
			<p className="text-gray-600 mt-4">Content below the divider</p>
		</div>
	);
}`,

    badge: `export default function App() {
	return (
		<div className="flex flex-wrap gap-2">
			<span className="px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
				Primary
			</span>
			<span className="px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded-full">
				Success
			</span>
			<span className="px-2.5 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
				Warning
			</span>
			<span className="px-2.5 py-0.5 text-xs font-medium bg-red-100 text-red-800 rounded-full">
				Error
			</span>
			<span className="px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">
				Default
			</span>
		</div>
	);
}`,

    sandpack: `export default function App() {
	return (
		<div className="p-4">
			<h1 className="text-2xl font-bold text-gray-900">
				Hello World
			</h1>
			<p className="text-gray-600 mt-2">
				Edit this component to see live updates
			</p>
		</div>
	);
}`,
  };

  return templates[type];
}

/**
 * Returns a human-readable label for a component type.
 */
export function getComponentLabel(type: ComponentType): string {
  const labels: Record<ComponentType, string> = {
    button: 'Button',
    input: 'Input Field',
    textarea: 'Textarea',
    checkbox: 'Checkbox',
    radio: 'Radio Group',
    select: 'Select Dropdown',
    toggle: 'Toggle Switch',
    form: 'Form',
    container: 'Container',
    card: 'Card',
    text: 'Text',
    image: 'Image',
    link: 'Link',
    divider: 'Divider',
    badge: 'Badge',
    sandpack: 'Component',
  };

  return labels[type];
}
