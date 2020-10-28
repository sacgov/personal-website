---
title: Demystifying Promises
---
## What is concurrency and how can we achieve it?

Quoting Wikipedia
> Concurrency is the ability of different parts or units of a program, algorithm, or problem to be executed out-of-order or in a partial order, without affecting the final outcome. This allows for parallel execution of the concurrent units, which can significantly improve the overall speed of the execution in multi-processor and multi-core systems.

Concurrency is basically running things in parallel. It is though ?. 
Concurrency is about dealing with lots of things at once. Parallelism is about doing lots of things at once. An application can be concurrent — but not parallel, which means that it processes more than one task at the same time, but no two tasks are executing at the same time instant. Parallelism is when tasks literally run at the same time.

If I'm replying to two threads in slack, one after the other. But before i finish the first message, I'm fully aware of the notification on the second thread. This means that I'm concurrently processing slack events.

For languages that use threads in the traditional sense, process any activity parallelly. Such systems have a master process/thread that queues and spins threads/processes for each activity they need to perform. Each process will independently wait for its activity to finish and responds accordingly.

For the remainder of the article, we will be referring to how concurrency works in node.js, explore various constructs for achieving it. Nodejs is a single-threaded system. This tells us that it processes one thing at a time.

### Event Loop of Node.js

This article will not into the details of how the node.js' event loop works. It also assumes knowledge of node.js. An important takeaway is that when parallelism can't be afforded, or the contention of exchanging information between threads and processes is high enough, we can opt for a simpler model.

The main thread processes the tasks and gives away the complexity of long-running tasks to an external system to manage. Let's look at an example.

```js
const crypto = require("crypto");
const start = Date.now();

function timeToGenerateSecureHash() {

  // pbkdf2 is a class of hash that takes time to compute. This is used to hash passwords.
  // on a side note this is the kind of hashes to prevent dictionary attacks
  crypto.pbkdf2("batman", "riddler", 100000, 512, "sha512", () => {
    console.log("Time taken :", Date.now() - start);
  });
}

// increase the amount of times this runs to see different times.
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();

/* Sample output
Time taken : 556
Time taken : 580
Time taken : 592
Time taken : 625
Time taken : 1047
Time taken : 1072
Time taken : 1083
Time taken : 1123
Time taken : 1561
Time taken : 1613
Time taken : 1645
Time taken : 1681
Time taken : 2037
Time taken : 2102
Time taken : 2135
Time taken : 2185
*/
```

Let's analyze what occurred in the above code sample. We wanted to calculate hashes which a long-running task. Node.js handed the tasks over to the os to calculate it and went on further. The OS diligently calculated it and waits for the process to finish. The OS runs it in parallel. This is traditionally parallel in a general sense. This means that hashes are calculated in parallel with 4 threads. So for every 4 threads, we see an increase of 400-500 ms in the time taken for the same calculation.

Let's play around with this example a bit.

```js
const crypto = require("crypto");
const start = Date.now();

function timeToGenerateSecureHash() {

  // pbkdf2 is a class of hash that takes time to compute. This is used to hash passwords.
  // on a side note this is the kind of hashes to prevent dictionary attacks
  crypto.pbkdf2("batman", "riddler", 100000, 512, "sha512", () => {
    console.log("Time taken :", Date.now() - start);
  });
}

// increase the amount of times this runs to see different times.
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
timeToGenerateSecureHash();
console.log(`Handed all task within ${Date.now() - start}`)

// let's busy-wait for 3 seconds

while(Date.now() - start < 3000) {
    // just wait for 3 seconds
    // play around with various times and check the times taken
}

/* Sample output
Time taken : 3000
Time taken : 3001
Time taken : 3001
Time taken : 3001
Time taken : 3002
Time taken : 3002
Time taken : 3002
Time taken : 3002
Time taken : 3003
Time taken : 3003
Time taken : 3003
Time taken : 3003
Time taken : 3004
Time taken : 3004
Time taken : 3004
Time taken : 3004
*/
```

In the above example, we delegate tasks to the OS and register a callback that we execute when we finish the task at hand. Each task at hand can schedule multiple tasks again into the OS/Eventloop. When we do an API call we delegate the IO events and waiting to the OS and registers callbacks when we get a response. Here the main thread takes 3 seconds by which all the callbacks are ready to execute.
For further information refer [Libuv](https://nikhilm.github.io/uvbook/introduction.html).

Oh, that is great, but how can schedule these handlers in sequence with each other. Or do a task a list of tasks without waiting for each to finish but maintain the current context. Enter Promises.

### What are Promises?

There are a lot of [resources](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) out there that explain Promises and their usage. We'll explore a basic example and get to its design.
A promise gives us a construct that allows us to go ahead with the task at hand, register a task once the promised task is done. We need a way to chain promises as well.

```js
const fetchApiResponse = (inputParam, callback, errorHandler) => {
  setTimeout(() => {
    if (inputParam < 10) {
      callback(inputParam + 1);
    } else {
      errorHandler(new Error('input greater than 10'));
    }
  }, 1000);
};

fetchApiResponse(5,(val)=> console.log(val), (e)=>console.log(e.message));
```
This is a typical use case where we do a fetch and we need a callback to do something meaningful with the result. We need an error handler to show appropriate error messages to the user. From now we will refer to fetchApiResponse as a function that finishes in the future.

*So Promise is something that results in an object that registers callbacks that execute in the future. They are thenable*.

```
// Design : finishesInFuture().then(callback)

const finishesInFuture = (input)=> {
  let callback;
  setTimeout(function () {
    callback(input+1);
  }, 1000);
  return {
    then: function (fn) {
      callback = fn;
    }
  };
};
finishesInFuture(5).then(console.log); // expected output 6
```

Now let's make an array of callbacks available to this handler.

```
const finishesInFuture = function (input) {
  const callbacks = [];
  setTimeout(function () {
    callbacks.forEach(callback=>{
      callback(input+1);
    });
  }, 1000);
  return {
    then: function (callback) {
      callbacks.push(callback);
    }
  };
};
const mypromise = finishesInFuture(5);
mypromise.then(()=>{
  console.log('this is first handler');
});
mypromise.then(()=>{
  console.log('this is second handler');
});
```

People who are concentrating now can see major flaws here. Once the settimeout runs, callbacks added later are never executed. Let's fix that.
```
// throws an error for now. We will fix it
mypromise..then(console.log).then(()=>{
  console.log('this is second handler');
});
```

We shall be focusing on callbacks added after the promise has finished or resolved in node.js terminology
```js
const finishesInFuture = function (input) {
  // lets define finish
  let finished = false;
  let calculatedValue = null;
  const callbacks = [];
  setTimeout(function () {
    calculatedValue = input+1;
    
    callbacks.forEach(callback=>{
      callback(calculatedValue);
    });
    finished = true;
  }, 1000);
  return {
    then: function (callback) {
        if(!finished) {
            callbacks.push(callback);
        } else {
            // we can't use calculated value to verify finish status sometimes as calculatedValue might be null after finish
            callback(calculatedValue)
        }
    }
  };
};
const mypromise = finishesInFuture(5);
mypromise.then(()=>{
  console.log('this is first handler');
});
mypromise.then(()=>{
  console.log('this is second handler');
});
```

I think we are ready to define our promise now. We will be calling it he *fPromise*. Registering callbacks and resolving them relates to promise rather than the *finishesInFuture*. Let's separate them

```js
const fPromise = function () {
  // lets define finish
  let finished = false;
  let calculatedValue = null;
  const callbacks = [];

  // see how calculated value has been moved outside of here in to the calling function
  return {
    resolve: function (value) {
      // allow resolving only once
      if(finished) {
        return;
      }
      calculatedValue = value;
      callbacks.forEach(callback=>{
        callback(calculatedValue);
      });
      finished = true;
    },
    then: function (callback) {
      if(!finished) {
        callbacks.push(callback);
      } else {
        // we can't use calculated value to verify finish status sometimes as calculatedValue might be null after finish
        callback(calculatedValue)
      }
    }
  }
};

const finishesInFuture = (input) => {
  const result = fPromise();
  setTimeout(function () {
    result.resolve(input+1);
    // try commenting the if in the resolve function above and uncomment below
    // result.resolve(input+1);
  }, 1000);

  // we return a promise here which can register callbacks
  return result;
}

const mypromise = finishesInFuture(5);
mypromise.then((val)=>{
  console.log(`this is first handler : ${val}`);
});
mypromise.then((val)=>{
  console.log(`this is second handler: ${val}`);
});
```
Gear up for the next transformation. To chain, any call to Promise should return a Promise and a .then on it also a Promise. It also follows logically.
Can we simplyfy this in any way. we need to generate a promise for the return values of the **then** function
```js
// this generate a simple fulfilled promise. Anything passed to .then executes instantly with the value
const initialGeneratePromise = function(value) {
  return {
    then: function(callback) {
      callback(value);
    }
  };
};

// checks if a function is thenable
const isPromise = function(value) {
  return value && typeof value.then === 'function';
};

const improvedGeneratePromise = function(value) {
  if (isPromise(value)) {
    return value;
  } else {
    return {
      then: function(callback) {
        callback(value);
      }
    };
  }
};

const finalGeneratePromise = function(value) {
  if (isPromise(value)) {
    return value;
  } else {
    return {
      then: function(callback) {
        return finalGeneratePromise(callback(value));
      }
    };
  }
};
```

We will be referring **finalGeneratePromise** as **generatePromise** from now on.
```
const isPromise = function(value) {
  return value && typeof value.then === 'function';
};

const generatePromise = function(value) {
  if (isPromise(value)) {
    return value;
  } else {
    return {
      then: function(callback) {
        return generatePromise(callback(value));
      }
    };
  }
};

const fPromise = function () {
  // lets define finish
  let finished = false;
  let calculatedValue = null;
  const callbacks = [];

  // see how calculated value has been moved outside of here in to the calling function
  return {
    resolve: function (value) {
      // allow resolving only once
      if(finished) {
        return;
      }
      calculatedValue = generatePromise(value);
      callbacks.forEach(callback=>{
        calculatedValue.then(callback);
      });
      finished = true;
    },
    then: function (callback) {
      // callback is wrapped so that its return
      // value is captured and used to resolve the promise
      // that "then" returns
      const result = fPromise();
      const wrappedCallback = function (value) {
        result.resolve(callback(value));
      };
      if(!finished) {
        callbacks.push(wrappedCallback);
      } else {
        calculatedValue.then(calculatedValue);
      }
      return result;
    }
  }
};

const finishesInFuture = (input) => {
  const result = fPromise();
  setTimeout(function () {
    result.resolve(input+1);
    // try commenting the if in the resolve function above and uncomment below
    // result.resolve(input+1);
  }, 1000);

  // we return a promise here which can register callbacks
  return result;
}

const mypromise = finishesInFuture(5);
mypromise.then((val)=>{
  console.log(`this is first handler : ${val}`);
  return val+1;
}).then((val)=>{
  console.log(`this is second handler: ${val}`);
});
```
We are done with basic implementation. *Reject* can be added in a similar fashion.