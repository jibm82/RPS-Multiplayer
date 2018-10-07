var config = {
  apiKey: "AIzaSyBML2LnFFgyIOe3XXmTWD2pY8cs-wNA9dE",
  authDomain: "fir-demo-eda69.firebaseapp.com",
  databaseURL: "https://fir-demo-eda69.firebaseio.com",
  projectId: "fir-demo-eda69",
  storageBucket: "fir-demo-eda69.appspot.com",
  messagingSenderId: "943450092840"
};

firebase.initializeApp(config);
const database = firebase.database();

var app = {
  clearInterval: false,
  countdownInterval: undefined,
  currentPlayers: 0,
  currentUser: {
    role: "guest",
  },
  currentUsers: 0,
  gameInProgress: false,
  playerLimit: 2,
  players: [
    {
      containerId: "#playerOne"
    },
    {
      containerId: "#playerTwo"
    }
  ],

  connectedRef: database.ref(".info/connected"),
  connectionsRef: database.ref("/connections"),
  messagesRef: database.ref("/messages"),
  playersRef: database.ref("/players"),
  duelInProgressRef: database.ref("/duelInProgress"),

  new: function () {
    this.bindActionClick();
    this.bindMessageFormSubmit();
    this.bindSignInFormSubmit();

    app.setupListeners();
  },

  bindActionClick: function () {
    $(".action").click(function (e) {
      e.preventDefault();
      var action = $(this).attr("data-action");

      // Check is user is a registered player
      app.playersRef.child(app.currentUser.id).once("value", function (playerSnapshot) {
        if (playerSnapshot.val()) {
          app.playersRef.child(app.currentUser.id).update({
            selection: action
          });

          // Hide modal
          $("#action-modal").modal("hide");
        }
      });
    })
  },

  bindMessageFormSubmit: function () {
    $("#message-form").submit(function (e) {
      e.preventDefault();

      app.messagesRef.push({
        user_id: app.currentUser.id,
        message: $("#message").val().trim(),
        name: app.currentUser.name,
        created_at: firebase.database.ServerValue.TIMESTAMP
      });

      $("#message").val("");
    });
  },

  bindSignInFormSubmit: function () {
    $('#name').trigger('focus');
    $("#name-form").submit(function (e) {
      e.preventDefault();

      app.currentUser.name = $("#name").val().trim();
      app.registerCurrentConnection();
      app.joinGame();

      $("body").addClass("signed-in");
    });
  },

  registerCurrentConnection: function () {
    app.connectedRef.once("value", function (currentConnectionSnapshot) {
      if (currentConnectionSnapshot.val()) {
        let connectionRef = app.connectionsRef.push({ name: app.currentUser.name });
        connectionRef.onDisconnect().remove();
        app.currentUser.id = connectionRef.key;
      }
    });
  },

  joinGame: function () {
    app.playersRef.transaction(
      function (players) {
        if (players === null) {
          players = {};
        }

        let playerIds = Object.keys(players);

        if (playerIds.length < app.playerLimit) {
          app.currentUser.role = "player";
          players[app.currentUser.id] = {
            name: app.currentUser.name,
            selection: ''
          };

          return players;
        }
      },

      function (error, committed) {
        if (!committed) {
          console.log('Game is full');
        }
      }
    );
  },

  setupListeners: function () {
    app.listenForConnectionsChange();
    app.listenForDisconnections();
    app.listenForDuelInProgress();
    app.listenForEmptySeat();
    app.listenForNewPlayer();
    app.listenForPlayersUpdate();
    app.listenForMessages();
  },

  listenForConnectionsChange: function () {
    this.connectionsRef.on("value", function (connectionsSnapshot) {
      app.currentUsers = connectionsSnapshot.numChildren();
    })
  },

  listenForDisconnections: function () {
    this.connectionsRef.on("child_removed", function (oldConnectionSnapshot) {
      app.playersRef.child(oldConnectionSnapshot.key).off("value");
      app.playersRef.child(oldConnectionSnapshot.key).remove();
    })
  },

  listenForDuelInProgress: function () {
    this.duelInProgressRef.on("value", function (duelInProgressSnapshot) {
      if (duelInProgressSnapshot.val()) {
        app.duelInProgress = duelInProgressSnapshot.val().status;

        if (app.duelInProgress) {
          app.handleDuelInProgress();
        } else {
          $("#game-status").text("");
          $(".status").text("");
        }
      } else {
        // Set default if key doesn't exists
        app.duelInProgressRef.set({ status: false });
      }
    })
  },

  handleDuelInProgress: function () {
    app.clearInterval = true;
    $(".status").text("Waiting for action");
    $("#game-status").text("");

    if (app.currentUser.role === "player") {
      $("#action-modal").modal("show");
    }
  },

  listenForEmptySeat: function () {
    app.playersRef.on("child_removed", function (oldPlayer) {
      let playerIndex = app.getPlayerIndexById(oldPlayer.key);
      app.players[playerIndex].id = undefined;
      app.updatePlayerName("Waiting for player", playerIndex);
      app.clearInterval = true;
      if (oldPlayer.key !== app.currentUser.id) {
        if (app.currentUser.role === "player") {
          $("#action-modal").modal("hide");
        } else {

        }
      }

      app.gameInProgress = false;
    });
  },

  listenForMessages: function () {
    app.messagesRef.limitToLast(5).on("child_added", function (childSnapshot) {
      var message = $("<p>").
        addClass("message").
        html(
          "<b>" + childSnapshot.val().name + "</b> <i>(" +
          moment(childSnapshot.val().created_at).fromNow() + ")</i>: " +
          childSnapshot.val().message
        );
      $("#messages").append(message);

      var messagesDiv = document.getElementById("messages");
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }, function (errorObject) {
      console.log("Errors handled: " + errorObject.code);
    });
  },

  listenForPlayersUpdate: function () {
    app.playersRef.on("value", function (snapshot) {
      app.currentPlayers = snapshot.numChildren();
      if (!app.duelInProgress && app.currentPlayers === app.playerLimit) {
        app.showNewMatchCountdown();
      } else if (app.currentPlayers < app.playerLimit) {
        app.duelInProgressRef.update({ status: false });
      }
    });
  },

  showNewMatchCountdown: function () {
    var seconds = 5;
    app.clearInterval = false;
    app.countdownInterval = setInterval(function () {
      if (app.clearInterval) {
        $("#game-status").text("");
        clearInterval(app.countdownInterval);
        app.clearInterval = false;
        app.countdownInterval = null;
      }

      if (seconds-- > 1) {
        $("#game-status").html("<span>New game in " + seconds + "</span>");
      } else {
        app.duelInProgressRef.update({ status: true });
      }
    }, 1000)
  },

  listenForNewPlayer: function () {
    app.playersRef.on("child_added", function (newPlayer) {
      // Check if player is still connected
      app.connectionsRef.child(newPlayer.key).once('value', function (snapshot) {
        if (snapshot.val()) {
          let playerIndex = app.setPlayerInitialValues(newPlayer);
          app.updatePlayerUI(playerIndex);
          app.bindPlayerChangesListener(newPlayer, playerIndex);
        } else {
          app.playersRef.child(newPlayer.key).remove();
        }
      });
    });
  },

  bindPlayerChangesListener: function (player) {
    app.playersRef.child(player.key).on("value", function (playerSnapshot) {
      var playerIndex = app.getPlayerIndexById(player.key);

      if (playerSnapshot.val() && playerSnapshot.val().selection) {
        app.players[playerIndex].selection = playerSnapshot.val().selection;
        app.updatePlayerStatus("Action selected", playerIndex);
      } else {
        app.players[playerIndex].selection = undefined;
      }

      if (app.players[0].selection && app.players[1].selection) {
        // Reveal player selections
        app.updatePlayerStatus("Chose " + app.players[0].selection, 0);
        app.updatePlayerStatus("Chose " + app.players[1].selection, 1);

        // Get winner
        var winner = app.winner();
        if (winner) {
          $("#game-status").text(winner.name + " wins");
        } else {
          $("#game-status").text("It's a draw");
        }

        // Update UI
        app.updatePlayerUI(0);
        app.updatePlayerUI(1);

        // Schedule next game
        setTimeout(function () {
          app.playersRef.child(app.players[0].id).update({ selection: '' });
          app.playersRef.child(app.players[1].id).update({ selection: '' });
          app.duelInProgressRef.update({ status: false });
          app.showNewMatchCountdown();
        }, 4000);
      }
    });
  },

  winner: function () {

    if (app.players[0].selection === app.players[1].selection) {
      app.players[0].ties++;
      app.players[1].ties++;
      return null;
    } else if (
      app.players[0].selection === "rock" && app.players[1].selection === "scissors" ||
      app.players[0].selection === "paper" && app.players[1].selection === "rock" ||
      app.players[0].selection === "scissors" && app.players[1].selection === "paper"
    ) {

      app.players[0].wins++;
      app.players[1].loses++;

      return app.players[0];
    } else {
      app.players[1].wins++;
      app.players[0].loses++;

      return app.players[1];
    }
  },

  setPlayerInitialValues: function (newPlayer) {
    let empyPlayerSeatIndex = app.empyPlayerSeatIndex();

    app.players[empyPlayerSeatIndex].id = newPlayer.key;
    app.players[empyPlayerSeatIndex].name = newPlayer.val().name;
    app.players[empyPlayerSeatIndex].action = undefined;
    app.players[empyPlayerSeatIndex].wins = 0;
    app.players[empyPlayerSeatIndex].ties = 0;
    app.players[empyPlayerSeatIndex].loses = 0;

    return empyPlayerSeatIndex;
  },

  empyPlayerSeatIndex: function () {
    return app.players[0].id === undefined ? 0 : 1;
  },

  getPlayerIndexById: function (playerId) {
    return app.players[0].id === playerId ? 0 : 1;
  },

  updatePlayerUI: function (playerIndex) {
    let player = app.players[playerIndex];
    let containerId = app.players[playerIndex].containerId;

    $(containerId).find(".name").text(player.name);
    $(containerId).find(".wins").text(player.wins);
    $(containerId).find(".ties").text(player.ties);
    $(containerId).find(".loses").text(player.loses);
  },

  updatePlayerName: function (name, playerIndex) {
    let containerId = app.players[playerIndex].containerId;

    $(containerId).find(".name").text(name);
  },

  updatePlayerStatus: function (status, playerIndex) {
    let containerId = app.players[playerIndex].containerId;

    $(containerId).find(".status").text(status);
  }
};

app.new();