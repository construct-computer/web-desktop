# Quick Start – React

[![Image 1: logo by @sawaratsuki1004](https://react.dev/_next/image?url=%2Fimages%2Fuwu.png&w=128&q=75)](https://react.dev/)

[React](https://react.dev/)

[v 19.2](https://react.dev/versions)

Search⌘Ctrl K

[Learn](https://react.dev/learn)

[Reference](https://react.dev/reference/react)

[Community](https://react.dev/community)

[Blog](https://react.dev/blog)

[](https://react.dev/community/translations)

[](https://github.com/facebook/react/releases)

### GET STARTED

*   [Quick Start](https://react.dev/learn "Quick Start")

    *   [Tutorial: Tic-Tac-Toe](https://react.dev/learn/tutorial-tic-tac-toe "Tutorial: Tic-Tac-Toe")
    *   [Thinking in React](https://react.dev/learn/thinking-in-react "Thinking in React")

*   [Installation](https://react.dev/learn/installation "Installation")

    *   [Creating a React App](https://react.dev/learn/creating-a-react-app "Creating a React App")
    *   [Build a React App from Scratch](https://react.dev/learn/build-a-react-app-from-scratch "Build a React App from Scratch")
    *   [Add React to an Existing Project](https://react.dev/learn/add-react-to-an-existing-project "Add React to an Existing Project")

*   [Setup](https://react.dev/learn/setup "Setup")

    *   [Editor Setup](https://react.dev/learn/editor-setup "Editor Setup")
    *   [Using TypeScript](https://react.dev/learn/typescript "Using TypeScript")
    *   [React Developer Tools](https://react.dev/learn/react-developer-tools "React Developer Tools")

*   [React Compiler](https://react.dev/learn/react-compiler "React Compiler")

    *   [Introduction](https://react.dev/learn/react-compiler/introduction "Introduction")
    *   [Installation](https://react.dev/learn/react-compiler/installation "Installation")
    *   [Incremental Adoption](https://react.dev/learn/react-compiler/incremental-adoption "Incremental Adoption")
    *   [Debugging and Troubleshooting](https://react.dev/learn/react-compiler/debugging "Debugging and Troubleshooting")

### LEARN REACT

*   [Describing the UI](https://react.dev/learn/describing-the-ui "Describing the UI")

    *   [Your First Component](https://react.dev/learn/your-first-component "Your First Component")
    *   [Importing and Exporting Components](https://react.dev/learn/importing-and-exporting-components "Importing and Exporting Components")
    *   [Writing Markup with JSX](https://react.dev/learn/writing-markup-with-jsx "Writing Markup with JSX")
    *   [JavaScript in JSX with Curly Braces](https://react.dev/learn/javascript-in-jsx-with-curly-braces "JavaScript in JSX with Curly Braces")
    *   [Passing Props to a Component](https://react.dev/learn/passing-props-to-a-component "Passing Props to a Component")
    *   [Conditional Rendering](https://react.dev/learn/conditional-rendering "Conditional Rendering")
    *   [Rendering Lists](https://react.dev/learn/rendering-lists "Rendering Lists")
    *   [Keeping Components Pure](https://react.dev/learn/keeping-components-pure "Keeping Components Pure")
    *   [Your UI as a Tree](https://react.dev/learn/understanding-your-ui-as-a-tree "Your UI as a Tree")

*   [Adding Interactivity](https://react.dev/learn/adding-interactivity "Adding Interactivity")

    *   [Responding to Events](https://react.dev/learn/responding-to-events "Responding to Events")
    *   [State: A Component's Memory](https://react.dev/learn/state-a-components-memory "State: A Component's Memory")
    *   [Render and Commit](https://react.dev/learn/render-and-commit "Render and Commit")
    *   [State as a Snapshot](https://react.dev/learn/state-as-a-snapshot "State as a Snapshot")
    *   [Queueing a Series of State Updates](https://react.dev/learn/queueing-a-series-of-state-updates "Queueing a Series of State Updates")
    *   [Updating Objects in State](https://react.dev/learn/updating-objects-in-state "Updating Objects in State")
    *   [Updating Arrays in State](https://react.dev/learn/updating-arrays-in-state "Updating Arrays in State")

*   [Managing State](https://react.dev/learn/managing-state "Managing State")

    *   [Reacting to Input with State](https://react.dev/learn/reacting-to-input-with-state "Reacting to Input with State")
    *   [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure "Choosing the State Structure")
    *   [Sharing State Between Components](https://react.dev/learn/sharing-state-between-components "Sharing State Between Components")
    *   [Preserving and Resetting State](https://react.dev/learn/preserving-and-resetting-state "Preserving and Resetting State")
    *   [Extracting State Logic into a Reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer "Extracting State Logic into a Reducer")
    *   [Passing Data Deeply with Context](https://react.dev/learn/passing-data-deeply-with-context "Passing Data Deeply with Context")
    *   [Scaling Up with Reducer and Context](https://react.dev/learn/scaling-up-with-reducer-and-context "Scaling Up with Reducer and Context")

*   [Escape Hatches](https://react.dev/learn/escape-hatches "Escape Hatches")

    *   [Referencing Values with Refs](https://react.dev/learn/referencing-values-with-refs "Referencing Values with Refs")
    *   [Manipulating the DOM with Refs](https://react.dev/learn/manipulating-the-dom-with-refs "Manipulating the DOM with Refs")
    *   [Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects "Synchronizing with Effects")
    *   [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect "You Might Not Need an Effect")
    *   [Lifecycle of Reactive Effects](https://react.dev/learn/lifecycle-of-reactive-effects "Lifecycle of Reactive Effects")
    *   [Separating Events from Effects](https://react.dev/learn/separating-events-from-effects "Separating Events from Effects")
    *   [Removing Effect Dependencies](https://react.dev/learn/removing-effect-dependencies "Removing Effect Dependencies")
    *   [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks "Reusing Logic with Custom Hooks")

[Learn React](https://react.dev/learn)

Copy page Copy

# Quick Start[](https://react.dev/learn#undefined "Link for this heading")

Welcome to the React documentation! This page will give you an introduction to 80% of the React concepts that you will use on a daily basis.

### You will learn

*   How to create and nest components
*   How to add markup and styles
*   How to display data
*   How to render conditions and lists
*   How to respond to events and update the screen
*   How to share data between components

## Creating and nesting components [](https://react.dev/learn#components "Link for Creating and nesting components ")

React apps are made out of _components_. A component is a piece of the UI (user interface) that has its own logic and appearance. A component can be as small as a button, or as large as an entire page.

React components are JavaScript functions that return markup:

`function MyButton() {  return (    <button>I'm a button</button>  );}`

Now that you’ve declared `MyButton`, you can nest it into another component:

`export default function MyApp() {  return (    <div>      <h1>Welcome to my app</h1>      <MyButton />    </div>  );}`

Notice that `<MyButton />` starts with a capital letter. That’s how you know it’s a React component. React component names must always start with a capital letter, while HTML tags must be lowercase.

Have a look at the result:

App.js

App.js

Reload Clear[Fork](https://codesandbox.io/api/v1/sandboxes/define?undefined&environment=create-react-app "Open in CodeSandbox")

function MyButton() {
  return (
    <button>
      I'm a button
    </button>
  );
}

export default function MyApp() {
  return (
    <div>
      <h1>Welcome to my app</h1>
      <MyButton />
    </div>
  );
}

Show more

The `export default` keywords specify the main component in the file. If you’re not familiar with some piece of JavaScript syntax, [MDN](https://developer.mozilla.org/en-US/docs/web/javascript/reference/statements/export) and [javascript.info](https://javascript.info/import-export) have great references.

## Writing markup with JSX [](https://react.dev/learn#writing-markup-with-jsx "Link for Writing markup with JSX ")

The markup syntax you’ve seen above is called _JSX_. It is optional, but most React projects use JSX for its convenience. All of the [tools we recommend for local development](https://react.dev/learn/installation) support JSX out of the box.

JSX is stricter than HTML. You have to close tags like `<br />`. Your component also can’t return multiple JSX tags. You have to wrap them into a shared parent, like a `<div>...</div>` or an empty `<>...</>` wrapper:

`function AboutPage() {  return (    <>      <h1>About</h1>      <p>Hello there.<br />How do you do?</p>    </>  );}`

If you have a lot of HTML to port to JSX, you can use an [online converter.](https://transform.tools/html-to-jsx)

## Adding styles [](https://react.dev/learn#adding-styles "Link for Adding styles ")

In React, you specify a CSS class with `className`. It works the same way as the HTML [`class`](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/class) attribute:

`<img className="avatar" />`

Then you write the CSS rules for it in a separate CSS file:

`/* In your CSS */.avatar {  border-radius: 50%;}`

React does not prescribe how you add CSS files. In the simplest case, you’ll add a [`<link>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/link) tag to your HTML. If you use a build tool or a framework, consult its documentation to learn how to add a CSS file to your project.

## Displaying data [](https://react.dev/learn#displaying-data "Link for Displaying data ")

JSX lets you put markup into JavaScript. Curly braces let you “escape back” into JavaScript so that you can embed some variable from your code and display it to the user. For example, this will display `user.name`:

`return (  <h1>    {user.name}  </h1>);`

You can also “escape into JavaScript” from JSX attributes, but you have to use curly braces _instead of_ quotes. For example, `className="avatar"` passes the `"avatar"` string as the CSS class, but `src={user.imageUrl}` reads the JavaScript `user.imageUrl` variable value, and then passes that value as the `src` attribute:

`return (  <img    className="avatar"    src={user.imageUrl}  />);`

You can put more complex expressions inside the JSX curly braces too, for example, [string concatenation](https://javascript.info/operators#string-concatenation-with-binary):

App.js

App.js

Reload Clear[Fork](https://codesandbox.io/api/v1/sandboxes/define?undefined&environment=create-react-app "Open in CodeSandbox")

const user = {
  name: 'Hedy Lamarr',
  imageUrl: 'https://react.dev/images/docs/scientists/yXOvdOSs.jpg',
  imageSize: 90,
};

export default function Profile() {
  return (
    <>
      <h1>{user.name}</h1>
      <img
        className="avatar"
        src={user.imageUrl}
        alt={'Photo of ' + user.name}
        style={{
          width: user.imageSize,
          height: user.imageSize
        }}
      />
    </>
  );
}

Show more

In the above example, `style={{}}` is not a special syntax, but a regular `{}` object inside the `style={ }` JSX curly braces. You can use the `style` attribute when your styles depend on JavaScript variables.

## Conditional rendering [](https://react.dev/learn#conditional-rendering "Link for Conditional rendering ")

In React, there is no special syntax for writing conditions. Instead, you’ll use the same techniques as you use when writing regular JavaScript code. For example, you can use an [`if`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/if...else) statement to conditionally include JSX:

`let content;if (isLoggedIn) {  content = <AdminPanel />;} else {  content = <LoginForm />;}return (  <div>    {content}  </div>);`

If you 