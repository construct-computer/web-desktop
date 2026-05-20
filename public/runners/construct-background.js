addEventListener('constructBackgroundRefresh', (resolve, reject, args) => {
  try {
    console.log('Construct background refresh', args || {});
    resolve();
  } catch (error) {
    reject(error);
  }
});

addEventListener('remoteNotification', (resolve, reject, args) => {
  try {
    console.log('Construct silent push notification', args || {});
    resolve();
  } catch (error) {
    reject(error);
  }
});
