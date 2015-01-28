define('winEvaluation',[], function() {

    // Clever evaluation method taken from
    // http://stackoverflow.com/questions/7033165/algorithm-to-check-a-connect-four-field
    // I implemented bit operations with arrays because bit operators are only supported
    // on 32-bits in javascript and here we need 47 bits to evaluate the full grid
    return {
        isWinningBoard: function(game, playerID) {
            var bitmask = [];
            // Compute the bitmask representation of the game for the user {playerID}
            for (var i = 0 ; i < 7; i++) {
                var row = game.getRow(i);
                for (var j = 0; j < 6 ; j++) {
                    if (row[j] == playerID) {
                        bitmask[(7*i) + j] = true;
                    }
                }
            }
            // Vertical alignment
            if (this.checkAlignment(bitmask, 1)) return true;
            // Horizontal alignment
            if (this.checkAlignment(bitmask, 7)) return true;
            // Diagonal /
            if (this.checkAlignment(bitmask, 8)) return true;
            // Diagonal \
            return (this.checkAlignment(bitmask, 6));
        },

        shiftArrayLeft: function(array, shift) {
            var shiftedArray = [];
            for (var i = shift ; i < array.length ; i++) {
                shiftedArray[i - shift] = array[i];
            }
            return shiftedArray;
        },

        arrayAnd: function(array1, array2) {
            var and = [];
            for (var i = 0 ; i < array1.length ; i++) {
                and[i] = array1[i] + array2[i];
            }
            return and;
        },

        checkAlignment: function(board, alignement) {
            // Get copy of values
            var combined = this.shiftArrayLeft(board, 0);
            for (var i = 1 ; i < 4 ; i++) {
                combined = this.arrayAnd(combined, this.shiftArrayLeft(board, alignement * i));
            }

            // There is an alignment as soon as 1 bit remains true
            for (var j = 0 ; j < combined.length ; j++) {
                if (combined[j]) return true;
            }

            return false;
        }
    };
});

/**
 * This function is a simple utility to give methods to a game object.
 * It is nothing more than a parsing method that takes the json representation of the current game
 * and manipulates its data via some level of abstraction.
 */
define('game',[], function() {
    var Game = function() {
    };

    // This is a utility to extend an object. I would use a library to use such things
    // for instance Backbone, but this is to have an example without any external libraries
    // but Plynd
    var _extend = function(_class, extension) {
        for (var property in extension) {
            if (extension.hasOwnProperty(property)) {
                _class.prototype[property] = extension[property];
            }
        }
    };

    _extend(Game, {
        // A few utilities to work with the state of the game. Again, a library like backbone would help
        getPlayer:function(searchedPlayerID) {
            return this.getPlayerBy(function(player) {return player.playerID == searchedPlayerID});
        },

        getPlayerWithTurn:function() {
            return this.getPlayerBy(function(player) {return player.status == 'has_turn'});
        },

        getPlayers:function(criteria) {
            return this.players.filter(criteria);
        },

        getPlayerBy:function(criteria) {
            var matched = this.getPlayers(criteria);
            return (matched.length) ? matched[0] : null;
        },

        getPlayerColor: function(playerID) {
            var player = this.getPlayer(playerID);
            return player.playerColor;
        },

        getOwnColor:function() {
            return this.getPlayerColor(this.ownPlayerID);
        },

        getOwnPlayer:function() {
            return this.getPlayer(this.ownPlayerID);
        },

        hasTurn: function() {
            var player = this.getOwnPlayer();
            return (player.status == 'has_turn');
        },

        isOver:function() {
            return (this.status == 'game_is_over');
        },

        getWinner:function() {
            return this.getPlayerBy(function(player) {return player.status == 'winner';});
        },

        initialize:function(attributes) {
            // Take the interesting info from the attributes
            this.loadMeta(attributes);

            this.state = attributes.state;
        },

        // The meta data is all the data managed by Plynd itself.
        // It includes :
        // - the players and their statuses (has_turn or waiting_turn)
        // - the game status (game_is_active or game_is_over)
        // - the ID of the player in this context
        loadMeta:function(meta) {
            // Take the interesting info from the meta state
            this.players = meta.players;
            this.status = meta.status;
            this.ownPlayerID = meta.ownPlayerID;
        },

        getRow:function(rowIndex) {
            return this.state['row_' + rowIndex];
        },

        canPlace:function(rowIndex) {
            var row = this.getRow(rowIndex);
            return (this.hasTurn() && row.length < 6);
        }
    });

    return Game;
});
/**
 * This file is specific to the Plynd framework.
 * The rationale is that for development purposes it can be run in the browser when the application is not
 * published yet. Later, it has to be uploaded to Plynd servers, where it will be run.
 * The reason is that the endpoint to update the game state (Plynd.updateGame(...)) is not available from
 * the browser scope while in production, to avoid cheats.
 *
 * It can have any name, but if using require (as here), it has to be explicitly built with the module name 'server'
 * (as it currently is in tools/build.js).
 * Also, when uploaded to the server, it has to be a single file (it cannot load more files dynamically during execution)
 *
 * The logic for the game of connect 4 is simple :
 * - on a new event, check if the row is full, and then update the game state.
 * - in the case this event sees the win of the player, specify it to the server by using the
 * specific field 'gameOver' = true in the event. This will have the effect of updating the meta-state of the game.
 *
 * This should not share state with the rest of the app, as it will run in a specific environment when the application
 * is published. However it can share logic with the rest of the app (as here, where we use the module 'game' in both places)
 */
define('server',[
    'winEvaluation',
    'game'
], function(WinEvaluation, Connect4Game) {

    Plynd.ServerFunctions.hello = function(data, success, error) {
        success({hello:"Hello Epitech!"});
    };

    Plynd.ServerFunctions.initializeGame = function(data, success, error) {
        var state = {};
        for (var i = 0; i < 7 ; i++) {
            (state['row_' + i]) || (state['row_' + i] = []);
        }

        Plynd.initializeState(state,success, error);
    };

    // Add a function to the pool of ServerFunctions
    Plynd.ServerFunctions.onNewEvent = function(event, success, error) {
        // An event simply specifies the row in which the player attempted to place a gem
        var row = event.row;

        var game = new Connect4Game();

        Plynd.getGame(function(gameResponse) {
            game.initialize(gameResponse);

            // Check if the player has turn
            if (!game.hasTurn()) {
                return error({
                    code:403,
                    data:"Not this player's turn"
                });
            }

            // Check if the row is not full
            var requestedRow = game.getRow(row);
            if (requestedRow.length >= 6) {
                return error({
                    code:403,
                    data:"The row " + row + " is full"
                });
            }

            // All good, append the playerID's gem ontop of the row
            var ownPlayer = game.getOwnPlayer();
            var ownPlayerID = ownPlayer.playerID;
            requestedRow.push(ownPlayerID);

            // Check if this is a winning position
            var event = {row:row};
            if (WinEvaluation.isWinningBoard(game, ownPlayerID)) {
                event.winnerID = ownPlayerID;
            }
            else {
                event.endTurn = true;
            }

            // Save the game
            var returnEvent = function(blob) {
                success(blob.event);
            };
            Plynd.updateGame(event, game.state, returnEvent, error);
        });
    };
});

