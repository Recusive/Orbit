/**
 * Component Library for Design System Canvas
 *
 * Pre-built shadcn/ui-style components with proper Radix primitive usage.
 * These serve as templates that can be dragged onto the canvas or
 * used by the AI agent to compose pages.
 */

export type ComponentCategory = 'ui' | 'layout' | 'form' | 'data-display' | 'feedback';

export interface ComponentProp {
  name: string;
  type: string;
  default?: string;
  description: string;
}

export interface ComponentTemplate {
  id: string;
  name: string;
  category: ComponentCategory;
  description: string;
  code: string;
  dependencies: string[];
  variants?: string[];
  props?: ComponentProp[];
}

// UI Components
const buttonComponent: ComponentTemplate = {
  id: 'button',
  name: 'Button',
  category: 'ui',
  description: 'Interactive button with multiple variants',
  dependencies: ['@radix-ui/react-slot', 'class-variance-authority'],
  variants: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
  props: [
    { name: 'variant', type: 'string', default: 'default', description: 'Button style variant' },
    { name: 'size', type: 'string', default: 'default', description: 'Button size' },
  ],
  code: `import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './lib/utils';

const buttonVariants = cva(
	'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
	{
		variants: {
			variant: {
				default: 'bg-gray-900 text-gray-50 hover:bg-gray-900/90',
				destructive: 'bg-red-500 text-gray-50 hover:bg-red-500/90',
				outline: 'border border-gray-200 bg-white hover:bg-gray-100 hover:text-gray-900',
				secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-100/80',
				ghost: 'hover:bg-gray-100 hover:text-gray-900',
				link: 'text-gray-900 underline-offset-4 hover:underline',
			},
			size: {
				default: 'h-10 px-4 py-2',
				sm: 'h-9 rounded-md px-3',
				lg: 'h-11 rounded-md px-8',
				icon: 'h-10 w-10',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	}
);

interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {
	asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant, size, asChild = false, ...props }, ref) => {
		const Comp = asChild ? Slot : 'button';
		return (
			<Comp
				className={cn(buttonVariants({ variant, size, className }))}
				ref={ref}
				{...props}
			/>
		);
	}
);
Button.displayName = 'Button';

export default function App() {
	return (
		<div className="flex flex-wrap gap-4 p-6">
			<Button>Default</Button>
			<Button variant="secondary">Secondary</Button>
			<Button variant="destructive">Destructive</Button>
			<Button variant="outline">Outline</Button>
			<Button variant="ghost">Ghost</Button>
			<Button variant="link">Link</Button>
		</div>
	);
}`,
};

const cardComponent: ComponentTemplate = {
  id: 'card',
  name: 'Card',
  category: 'ui',
  description: 'Container with header, content, and footer sections',
  dependencies: [],
  code: `import { cn } from './lib/utils';

const Card = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn('rounded-lg border bg-white text-gray-950 shadow-sm', className)}
		{...props}
	/>
);

const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
	<div className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
);

const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
	<h3 className={cn('text-2xl font-semibold leading-none tracking-tight', className)} {...props} />
);

const CardDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
	<p className={cn('text-sm text-gray-500', className)} {...props} />
);

const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
	<div className={cn('p-6 pt-0', className)} {...props} />
);

const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
	<div className={cn('flex items-center p-6 pt-0', className)} {...props} />
);

export default function App() {
	return (
		<Card className="w-[350px]">
			<CardHeader>
				<CardTitle>Card Title</CardTitle>
				<CardDescription>Card description goes here.</CardDescription>
			</CardHeader>
			<CardContent>
				<p>This is the main content area of the card.</p>
			</CardContent>
			<CardFooter>
				<button className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm">
					Action
				</button>
			</CardFooter>
		</Card>
	);
}`,
};

const badgeComponent: ComponentTemplate = {
  id: 'badge',
  name: 'Badge',
  category: 'ui',
  description: 'Small status indicator',
  dependencies: ['class-variance-authority'],
  variants: ['default', 'secondary', 'destructive', 'outline'],
  code: `import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './lib/utils';

const badgeVariants = cva(
	'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-gray-950 focus:ring-offset-2',
	{
		variants: {
			variant: {
				default: 'border-transparent bg-gray-900 text-gray-50 hover:bg-gray-900/80',
				secondary: 'border-transparent bg-gray-100 text-gray-900 hover:bg-gray-100/80',
				destructive: 'border-transparent bg-red-500 text-gray-50 hover:bg-red-500/80',
				outline: 'text-gray-950',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	}
);

interface BadgeProps
	extends React.HTMLAttributes<HTMLDivElement>,
		VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
	return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export default function App() {
	return (
		<div className="flex flex-wrap gap-2 p-4">
			<Badge>Default</Badge>
			<Badge variant="secondary">Secondary</Badge>
			<Badge variant="destructive">Destructive</Badge>
			<Badge variant="outline">Outline</Badge>
		</div>
	);
}`,
};

const avatarComponent: ComponentTemplate = {
  id: 'avatar',
  name: 'Avatar',
  category: 'data-display',
  description: 'User avatar with image and fallback',
  dependencies: ['@radix-ui/react-avatar'],
  code: `import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn } from './lib/utils';

const Avatar = React.forwardRef<
	React.ElementRef<typeof AvatarPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
	<AvatarPrimitive.Root
		ref={ref}
		className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full', className)}
		{...props}
	/>
));
Avatar.displayName = 'Avatar';

const AvatarImage = React.forwardRef<
	React.ElementRef<typeof AvatarPrimitive.Image>,
	React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
	<AvatarPrimitive.Image
		ref={ref}
		className={cn('aspect-square h-full w-full', className)}
		{...props}
	/>
));
AvatarImage.displayName = 'AvatarImage';

const AvatarFallback = React.forwardRef<
	React.ElementRef<typeof AvatarPrimitive.Fallback>,
	React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
	<AvatarPrimitive.Fallback
		ref={ref}
		className={cn('flex h-full w-full items-center justify-center rounded-full bg-gray-100', className)}
		{...props}
	/>
));
AvatarFallback.displayName = 'AvatarFallback';

export default function App() {
	return (
		<div className="flex gap-4 p-4">
			<Avatar>
				<AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
				<AvatarFallback>CN</AvatarFallback>
			</Avatar>
			<Avatar>
				<AvatarFallback>JD</AvatarFallback>
			</Avatar>
		</div>
	);
}`,
};

// Form Components
const inputComponent: ComponentTemplate = {
  id: 'input',
  name: 'Input',
  category: 'form',
  description: 'Text input field with label',
  dependencies: [],
  code: `import * as React from 'react';
import { cn } from './lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
	({ className, type, ...props }, ref) => {
		return (
			<input
				type={type}
				className={cn(
					'flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
					className
				)}
				ref={ref}
				{...props}
			/>
		);
	}
);
Input.displayName = 'Input';

export default function App() {
	return (
		<div className="w-full max-w-sm space-y-2 p-4">
			<label className="text-sm font-medium text-gray-900">Email</label>
			<Input type="email" placeholder="Enter your email" />
		</div>
	);
}`,
};

const checkboxComponent: ComponentTemplate = {
  id: 'checkbox',
  name: 'Checkbox',
  category: 'form',
  description: 'Checkbox with Radix primitive',
  dependencies: ['@radix-ui/react-checkbox', 'lucide-react'],
  code: `import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { cn } from './lib/utils';

const Checkbox = React.forwardRef<
	React.ElementRef<typeof CheckboxPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
	<CheckboxPrimitive.Root
		ref={ref}
		className={cn(
			'peer h-4 w-4 shrink-0 rounded-sm border border-gray-900 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-gray-900 data-[state=checked]:text-gray-50',
			className
		)}
		{...props}
	>
		<CheckboxPrimitive.Indicator className={cn('flex items-center justify-center text-current')}>
			<Check className="h-4 w-4" />
		</CheckboxPrimitive.Indicator>
	</CheckboxPrimitive.Root>
));
Checkbox.displayName = 'Checkbox';

export default function App() {
	return (
		<div className="flex items-center space-x-2 p-4">
			<Checkbox id="terms" />
			<label
				htmlFor="terms"
				className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
			>
				Accept terms and conditions
			</label>
		</div>
	);
}`,
};

const switchComponent: ComponentTemplate = {
  id: 'switch',
  name: 'Switch',
  category: 'form',
  description: 'Toggle switch',
  dependencies: ['@radix-ui/react-switch'],
  code: `import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from './lib/utils';

const Switch = React.forwardRef<
	React.ElementRef<typeof SwitchPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
	<SwitchPrimitive.Root
		className={cn(
			'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-gray-900 data-[state=unchecked]:bg-gray-200',
			className
		)}
		{...props}
		ref={ref}
	>
		<SwitchPrimitive.Thumb
			className={cn(
				'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0'
			)}
		/>
	</SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';

export default function App() {
	return (
		<div className="flex items-center space-x-2 p-4">
			<Switch id="airplane-mode" />
			<label htmlFor="airplane-mode" className="text-sm font-medium">
				Airplane Mode
			</label>
		</div>
	);
}`,
};

const selectComponent: ComponentTemplate = {
  id: 'select',
  name: 'Select',
  category: 'form',
  description: 'Dropdown select with Radix primitive',
  dependencies: ['@radix-ui/react-select', 'lucide-react'],
  code: `import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from './lib/utils';

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.Trigger>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
	<SelectPrimitive.Trigger
		ref={ref}
		className={cn(
			'flex h-10 w-full items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
			className
		)}
		{...props}
	>
		{children}
		<SelectPrimitive.Icon asChild>
			<ChevronDown className="h-4 w-4 opacity-50" />
		</SelectPrimitive.Icon>
	</SelectPrimitive.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

const SelectContent = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
	<SelectPrimitive.Portal>
		<SelectPrimitive.Content
			ref={ref}
			className={cn(
				'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-white text-gray-950 shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
				position === 'popper' &&
					'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
				className
			)}
			position={position}
			{...props}
		>
			<SelectPrimitive.Viewport
				className={cn(
					'p-1',
					position === 'popper' &&
						'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]'
				)}
			>
				{children}
			</SelectPrimitive.Viewport>
		</SelectPrimitive.Content>
	</SelectPrimitive.Portal>
));
SelectContent.displayName = 'SelectContent';

const SelectItem = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.Item>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
	<SelectPrimitive.Item
		ref={ref}
		className={cn(
			'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-gray-100 focus:text-gray-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
			className
		)}
		{...props}
	>
		<span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
			<SelectPrimitive.ItemIndicator>
				<Check className="h-4 w-4" />
			</SelectPrimitive.ItemIndicator>
		</span>
		<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
	</SelectPrimitive.Item>
));
SelectItem.displayName = 'SelectItem';

export default function App() {
	return (
		<div className="w-[200px] p-4">
			<Select>
				<SelectTrigger>
					<SelectValue placeholder="Select a fruit" />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						<SelectItem value="apple">Apple</SelectItem>
						<SelectItem value="banana">Banana</SelectItem>
						<SelectItem value="orange">Orange</SelectItem>
						<SelectItem value="grape">Grape</SelectItem>
					</SelectGroup>
				</SelectContent>
			</Select>
		</div>
	);
}`,
};

// Layout Components
const headerComponent: ComponentTemplate = {
  id: 'header',
  name: 'Header',
  category: 'layout',
  description: 'Page header with navigation',
  dependencies: ['lucide-react'],
  code: `import { Menu } from 'lucide-react';

export default function App() {
	return (
		<header className="border-b bg-white">
			<div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
				<div className="flex items-center gap-8">
					<a href="#" className="text-xl font-bold text-gray-900">
						Logo
					</a>
					<nav className="hidden md:flex items-center gap-6">
						<a href="#" className="text-sm font-medium text-gray-600 hover:text-gray-900">
							Home
						</a>
						<a href="#" className="text-sm font-medium text-gray-600 hover:text-gray-900">
							Products
						</a>
						<a href="#" className="text-sm font-medium text-gray-600 hover:text-gray-900">
							About
						</a>
						<a href="#" className="text-sm font-medium text-gray-600 hover:text-gray-900">
							Contact
						</a>
					</nav>
				</div>
				<div className="flex items-center gap-4">
					<button className="hidden md:inline-flex px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
						Sign In
					</button>
					<button className="hidden md:inline-flex px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800">
						Get Started
					</button>
					<button className="md:hidden p-2">
						<Menu className="h-6 w-6 text-gray-600" />
					</button>
				</div>
			</div>
		</header>
	);
}`,
};

const sidebarComponent: ComponentTemplate = {
  id: 'sidebar',
  name: 'Sidebar',
  category: 'layout',
  description: 'Collapsible sidebar navigation',
  dependencies: ['lucide-react'],
  code: `import { Home, Settings, Users, BarChart, FileText, HelpCircle } from 'lucide-react';
import { cn } from './lib/utils';

const navItems = [
	{ icon: Home, label: 'Dashboard', active: true },
	{ icon: Users, label: 'Users' },
	{ icon: BarChart, label: 'Analytics' },
	{ icon: FileText, label: 'Documents' },
	{ icon: Settings, label: 'Settings' },
	{ icon: HelpCircle, label: 'Help' },
];

export default function App() {
	return (
		<aside className="flex h-screen w-64 flex-col border-r bg-white">
			<div className="flex h-16 items-center border-b px-6">
				<span className="text-xl font-bold text-gray-900">Dashboard</span>
			</div>
			<nav className="flex-1 space-y-1 p-4">
				{navItems.map((item) => (
					<a
						key={item.label}
						href="#"
						className={cn(
							'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
							item.active
								? 'bg-gray-100 text-gray-900'
								: 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
						)}
					>
						<item.icon className="h-5 w-5" />
						{item.label}
					</a>
				))}
			</nav>
		</aside>
	);
}`,
};

const footerComponent: ComponentTemplate = {
  id: 'footer',
  name: 'Footer',
  category: 'layout',
  description: 'Page footer with links',
  dependencies: [],
  code: `export default function App() {
	return (
		<footer className="border-t bg-gray-50">
			<div className="mx-auto max-w-7xl px-4 py-12">
				<div className="grid grid-cols-2 md:grid-cols-4 gap-8">
					<div>
						<h3 className="text-sm font-semibold text-gray-900 mb-3">Product</h3>
						<ul className="space-y-2">
							<li><a href="#" className="text-sm text-gray-600 hover:text-gray-900">Features</a></li>
							<li><a href="#" className="text-sm text-gray-600 hover:text-gray-900">Pricing</a></li>
							<li><a href="#" className="text-sm text-gray-600 hover:text-gray-900">Changelog</a></li>
						</ul>
					</div>
					<div>
						<h3 className="text-sm font-semibold text-gray-900 mb-3">Company</h3>
						<ul className="space-y-2">
							<li><a href="#" className="text-sm text-gray-600 hover:text-gray-900">About</a></li>
							<li><a href="#" className="text-sm text-gray-600 hover:text-gray-900">Blog</a></li>
							<li><a href="#" className="text-sm text-gray-600 hover:text-gray-900">Careers</a></li>
						</ul>
					</div>
					<div>
						<h3 className="text-sm font-semibold text-gray-900 mb-3">Resources</h3>
						<ul className="space-y-2">
							<li><a href="#" className="text-sm text-gray-600 hover:text-gray-900">Documentation</a></li>
							<li><a href="#" className="text-sm text-gray-600 hover:text-gray-900">Guides</a></li>
							<li><a href="#" className="text-sm text-gray-600 hover:text-gray-900">Support</a></li>
						</ul>
					</div>
					<div>
						<h3 className="text-sm font-semibold text-gray-900 mb-3">Legal</h3>
						<ul className="space-y-2">
							<li><a href="#" className="text-sm text-gray-600 hover:text-gray-900">Privacy</a></li>
							<li><a href="#" className="text-sm text-gray-600 hover:text-gray-900">Terms</a></li>
							<li><a href="#" className="text-sm text-gray-600 hover:text-gray-900">Cookie Policy</a></li>
						</ul>
					</div>
				</div>
				<div className="mt-8 border-t pt-8 text-center">
					<p className="text-sm text-gray-500">&copy; 2024 Company. All rights reserved.</p>
				</div>
			</div>
		</footer>
	);
}`,
};

// Feedback Components
const dialogComponent: ComponentTemplate = {
  id: 'dialog',
  name: 'Dialog',
  category: 'feedback',
  description: 'Modal dialog with Radix primitive',
  dependencies: ['@radix-ui/react-dialog', 'lucide-react'],
  code: `import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from './lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Overlay>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Overlay
		ref={ref}
		className={cn(
			'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
			className
		)}
		{...props}
	/>
));
DialogOverlay.displayName = 'DialogOverlay';

const DialogContent = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
	<DialogPortal>
		<DialogOverlay />
		<DialogPrimitive.Content
			ref={ref}
			className={cn(
				'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-white p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg',
				className
			)}
			{...props}
		>
			{children}
			<DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-gray-950 focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-gray-100 data-[state=open]:text-gray-500">
				<X className="h-4 w-4" />
				<span className="sr-only">Close</span>
			</DialogPrimitive.Close>
		</DialogPrimitive.Content>
	</DialogPortal>
));
DialogContent.displayName = 'DialogContent';

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
	<div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);

const DialogTitle = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Title>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Title
		ref={ref}
		className={cn('text-lg font-semibold leading-none tracking-tight', className)}
		{...props}
	/>
));
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Description>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Description
		ref={ref}
		className={cn('text-sm text-gray-500', className)}
		{...props}
	/>
));
DialogDescription.displayName = 'DialogDescription';

export default function App() {
	return (
		<div className="p-4">
			<Dialog>
				<DialogTrigger asChild>
					<button className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800">
						Open Dialog
					</button>
				</DialogTrigger>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Are you sure?</DialogTitle>
						<DialogDescription>
							This action cannot be undone. This will permanently delete your account
							and remove your data from our servers.
						</DialogDescription>
					</DialogHeader>
					<div className="flex justify-end gap-3 mt-4">
						<DialogClose asChild>
							<button className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
								Cancel
							</button>
						</DialogClose>
						<button className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-md hover:bg-red-600">
							Delete
						</button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}`,
};

const progressComponent: ComponentTemplate = {
  id: 'progress',
  name: 'Progress',
  category: 'feedback',
  description: 'Progress indicator',
  dependencies: ['@radix-ui/react-progress'],
  code: `import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from './lib/utils';

const Progress = React.forwardRef<
	React.ElementRef<typeof ProgressPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
	<ProgressPrimitive.Root
		ref={ref}
		className={cn('relative h-4 w-full overflow-hidden rounded-full bg-gray-100', className)}
		{...props}
	>
		<ProgressPrimitive.Indicator
			className="h-full w-full flex-1 bg-gray-900 transition-all"
			style={{ transform: \`translateX(-\${100 - (value || 0)}%)\` }}
		/>
	</ProgressPrimitive.Root>
));
Progress.displayName = 'Progress';

export default function App() {
	const [progress, setProgress] = React.useState(13);

	React.useEffect(() => {
		const timer = setTimeout(() => setProgress(66), 500);
		return () => clearTimeout(timer);
	}, []);

	return (
		<div className="w-[300px] p-4">
			<Progress value={progress} />
			<p className="mt-2 text-sm text-gray-500">{progress}% complete</p>
		</div>
	);
}`,
};

const alertComponent: ComponentTemplate = {
  id: 'alert',
  name: 'Alert',
  category: 'feedback',
  description: 'Alert message with variants',
  dependencies: ['lucide-react', 'class-variance-authority'],
  code: `import { AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './lib/utils';

const alertVariants = cva(
	'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-current',
	{
		variants: {
			variant: {
				default: 'bg-white text-gray-950',
				destructive: 'border-red-500/50 text-red-500 [&>svg]:text-red-500 bg-red-50',
				success: 'border-green-500/50 text-green-600 [&>svg]:text-green-600 bg-green-50',
				warning: 'border-yellow-500/50 text-yellow-600 [&>svg]:text-yellow-600 bg-yellow-50',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	}
);

interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

function Alert({ className, variant, ...props }: AlertProps) {
	return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

const AlertTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
	<h5 className={cn('mb-1 font-medium leading-none tracking-tight', className)} {...props} />
);

const AlertDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
	<div className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />
);

const icons = {
	default: Info,
	destructive: AlertCircle,
	success: CheckCircle,
	warning: AlertTriangle,
};

export default function App() {
	return (
		<div className="w-[400px] space-y-4 p-4">
			<Alert>
				<Info className="h-4 w-4" />
				<AlertTitle>Heads up!</AlertTitle>
				<AlertDescription>
					You can add components to your app using the CLI.
				</AlertDescription>
			</Alert>

			<Alert variant="destructive">
				<AlertCircle className="h-4 w-4" />
				<AlertTitle>Error</AlertTitle>
				<AlertDescription>
					Your session has expired. Please log in again.
				</AlertDescription>
			</Alert>

			<Alert variant="success">
				<CheckCircle className="h-4 w-4" />
				<AlertTitle>Success</AlertTitle>
				<AlertDescription>
					Your changes have been saved successfully.
				</AlertDescription>
			</Alert>

			<Alert variant="warning">
				<AlertTriangle className="h-4 w-4" />
				<AlertTitle>Warning</AlertTitle>
				<AlertDescription>
					Your account is about to expire. Renew now.
				</AlertDescription>
			</Alert>
		</div>
	);
}`,
};

// Data Display Components
const tableComponent: ComponentTemplate = {
  id: 'table',
  name: 'Table',
  category: 'data-display',
  description: 'Data table with styling',
  dependencies: [],
  code: `import { cn } from './lib/utils';

const Table = ({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
	<div className="relative w-full overflow-auto">
		<table className={cn('w-full caption-bottom text-sm', className)} {...props} />
	</div>
);

const TableHeader = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
	<thead className={cn('[&_tr]:border-b', className)} {...props} />
);

const TableBody = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
	<tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
);

const TableRow = ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
	<tr
		className={cn('border-b transition-colors hover:bg-gray-50 data-[state=selected]:bg-gray-100', className)}
		{...props}
	/>
);

const TableHead = ({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
	<th
		className={cn(
			'h-12 px-4 text-left align-middle font-medium text-gray-500 [&:has([role=checkbox])]:pr-0',
			className
		)}
		{...props}
	/>
);

const TableCell = ({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
	<td className={cn('p-4 align-middle [&:has([role=checkbox])]:pr-0', className)} {...props} />
);

const data = [
	{ id: 1, name: 'John Doe', email: 'john@example.com', status: 'Active' },
	{ id: 2, name: 'Jane Smith', email: 'jane@example.com', status: 'Pending' },
	{ id: 3, name: 'Bob Johnson', email: 'bob@example.com', status: 'Inactive' },
];

export default function App() {
	return (
		<div className="p-4">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Name</TableHead>
						<TableHead>Email</TableHead>
						<TableHead>Status</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{data.map((row) => (
						<TableRow key={row.id}>
							<TableCell className="font-medium">{row.name}</TableCell>
							<TableCell>{row.email}</TableCell>
							<TableCell>
								<span className={cn(
									'inline-flex items-center rounded-full px-2 py-1 text-xs font-medium',
									row.status === 'Active' && 'bg-green-50 text-green-700',
									row.status === 'Pending' && 'bg-yellow-50 text-yellow-700',
									row.status === 'Inactive' && 'bg-gray-100 text-gray-600'
								)}>
									{row.status}
								</span>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}`,
};

const tabsComponent: ComponentTemplate = {
  id: 'tabs',
  name: 'Tabs',
  category: 'data-display',
  description: 'Tabbed content with Radix primitive',
  dependencies: ['@radix-ui/react-tabs'],
  code: `import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from './lib/utils';

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
	React.ElementRef<typeof TabsPrimitive.List>,
	React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
	<TabsPrimitive.List
		ref={ref}
		className={cn(
			'inline-flex h-10 items-center justify-center rounded-md bg-gray-100 p-1 text-gray-500',
			className
		)}
		{...props}
	/>
));
TabsList.displayName = 'TabsList';

const TabsTrigger = React.forwardRef<
	React.ElementRef<typeof TabsPrimitive.Trigger>,
	React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
	<TabsPrimitive.Trigger
		ref={ref}
		className={cn(
			'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white data-[state=active]:text-gray-950 data-[state=active]:shadow-sm',
			className
		)}
		{...props}
	/>
));
TabsTrigger.displayName = 'TabsTrigger';

const TabsContent = React.forwardRef<
	React.ElementRef<typeof TabsPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
	<TabsPrimitive.Content
		ref={ref}
		className={cn(
			'mt-2 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2',
			className
		)}
		{...props}
	/>
));
TabsContent.displayName = 'TabsContent';

export default function App() {
	return (
		<div className="w-[400px] p-4">
			<Tabs defaultValue="account">
				<TabsList className="grid w-full grid-cols-2">
					<TabsTrigger value="account">Account</TabsTrigger>
					<TabsTrigger value="password">Password</TabsTrigger>
				</TabsList>
				<TabsContent value="account">
					<div className="rounded-lg border p-4 mt-2">
						<h3 className="text-lg font-medium">Account</h3>
						<p className="text-sm text-gray-500 mt-1">
							Make changes to your account here. Click save when you're done.
						</p>
					</div>
				</TabsContent>
				<TabsContent value="password">
					<div className="rounded-lg border p-4 mt-2">
						<h3 className="text-lg font-medium">Password</h3>
						<p className="text-sm text-gray-500 mt-1">
							Change your password here. After saving, you'll be logged out.
						</p>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}`,
};

// Export the component library
export const COMPONENT_LIBRARY: Record<string, ComponentTemplate> = {
  // UI
  button: buttonComponent,
  card: cardComponent,
  badge: badgeComponent,

  // Form
  input: inputComponent,
  checkbox: checkboxComponent,
  switch: switchComponent,
  select: selectComponent,

  // Layout
  header: headerComponent,
  sidebar: sidebarComponent,
  footer: footerComponent,

  // Data Display
  avatar: avatarComponent,
  table: tableComponent,
  tabs: tabsComponent,

  // Feedback
  dialog: dialogComponent,
  progress: progressComponent,
  alert: alertComponent,
};

/**
 * Get components grouped by category
 */
export function getComponentsByCategory(): Record<ComponentCategory, ComponentTemplate[]> {
  const result: Record<ComponentCategory, ComponentTemplate[]> = {
    ui: [],
    layout: [],
    form: [],
    'data-display': [],
    feedback: [],
  };

  Object.values(COMPONENT_LIBRARY).forEach((component) => {
    result[component.category].push(component);
  });

  return result;
}

/**
 * Get a component template by ID
 */
export function getComponent(id: string): ComponentTemplate | undefined {
  return COMPONENT_LIBRARY[id];
}

/**
 * Search components by name or description
 */
export function searchComponents(query: string): ComponentTemplate[] {
  const lowerQuery = query.toLowerCase();
  return Object.values(COMPONENT_LIBRARY).filter(
    (c): boolean =>
      c.name.toLowerCase().includes(lowerQuery) || c.description.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Category display names
 */
export const CATEGORY_LABELS: Record<ComponentCategory, string> = {
  ui: 'UI',
  layout: 'Layout',
  form: 'Form',
  'data-display': 'Data Display',
  feedback: 'Feedback',
};
