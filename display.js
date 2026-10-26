var CHESSGAME_SQUARE_WIDTH = 30;
var CHESSGAME_SQUARE_HEIGHT = 30;
var CHESSGAME_WRAPPER_CLASS = 'chessgame-wrapper';
var CHESSGAME_BOARD_CLASS = 'chessgame-board';
var CHESSGAME_MESSAGES_CLASS = 'chessgame-messages';
var CHESSGAME_LOG_CLASS = 'chessgame-log';
var CHESSGAME_CONTROLS_CLASS = 'chessgame-controls';
var CHESSGAME_BLACK_SQUARE = 'chessgame-black-square';
var CHESSGAME_WHITE_SQUARE = 'chessgame-white-square';
var CHESSGAME_DOT = 'chessgame-dot';
var CHESSGAME_CAPTURE_DOT = 'chessgame-capture-dot';

var CHESSGAME_ROTATE_BOARD = true;
var CHESSGAME_LEVELS = ['stupid', 'middling', 'default', 'slow', 'slowest'];
var CHESSGAME_DEFAULT_LEVEL = 2;
var CHESSGAME_ADAPTIVE_LEVELS = false;

var CHESSGAME_IMAGE_DIR = 'images';

var CHESSGAME_IMAGE_NAMES = [
    'empty.gif',
    '',
    'white_pawn.svg',
    'black_pawn.svg',
    'white_rook.svg',
    'black_rook.svg',
    'white_knight.svg',
    'black_knight.svg',
    'white_bishop.svg',
    'black_bishop.svg',
    'white_king.svg',
    'black_king.svg',
    'white_queen.svg',
    'black_queen.svg'
];

var CHESSGAME_PROMOTION_STRINGS = ['queen', 'rook', 'knight', 'bishop'];
var CHESSGAME_PROMOTION_INTS = [CHESSGAME_QUEEN, CHESSGAME_ROOK, CHESSGAME_KNIGHT, CHESSGAME_BISHOP];

var _chessgame_proto = {};

function _add_event_listener(el, eventname, fn){
    if (el.addEventListener === undefined){
        el.attachEvent('on' + eventname, fn);
    }
    else {
        el.addEventListener(eventname, fn);
    }
}

function _event_target(e){

    return (e.currentTarget) ? e.currentTarget : e.srcElement;
}

_chessgame_proto.square_clicked = function(square){
    var board = this.board_state.board;
    var mover = this.board_state.to_play;
    if (this.players[mover] == 'computer'){
        chessgame_log("not your turn!");
        return;
    }
    var piece = board[square];
    if (this.start == square){

        this.stop_moving_piece();
    }
    else if (piece && (mover == (piece & 1))){

        this.start_moving_piece(square);
    }
    else if (this.move(this.start, square, CHESSGAME_PROMOTION_INTS[this.pawn_becomes])){

        this.stop_moving_piece(square);
    }
};

_chessgame_proto.move = function(start, end, promotion){
    var state = this.board_state;
    var move_result = state.move(start, end, promotion);
    if(move_result.ok){
        this.display_move_text(state.moveno, move_result.string);
        this.refresh();
        if (! (move_result.flags & CHESSGAME_MOVE_FLAG_MATE)){
            this.next_move_timeout = window.setTimeout(
                function(chessgame){
                    return function(){
                        chessgame.next_move();
                    };
                }(this), 1);
        }
    }
    else {
        chessgame_log("bad move!", start, end);
    }
    for (var i = 0; i < this.move_listeners.length; i++){
        this.move_listeners[i](move_result);
    }
    return move_result.ok;
};

_chessgame_proto.next_move = function(){
    var mover = this.board_state.to_play;
    if (this.players[mover] == 'computer' &&
        this.auto_play_timeout === undefined){
        var timeout = (this.players[1 - mover] == 'computer') ? 500: 10;
        var chessgame = this;
        this.auto_play_timeout = window.setTimeout(function(){chessgame.computer_move();},
                                                   timeout);
    }
};

_chessgame_proto.computer_move = function(){
    this.auto_play_timeout = undefined;
    var state = this.board_state;
    var mv;
    var depth = this.computer_level + 1;
    var start_time = Date.now();
    mv = state.findmove(depth);
    var delta = Date.now() - start_time;
    chessgame_log("findmove took", delta);
    if (CHESSGAME_ADAPTIVE_LEVELS && depth > 2){
        var min_time = 25 * depth;
        while (delta < min_time){
            depth++;
            mv = state.findmove(depth);
            delta = Date.now() - start_time;
            chessgame_log("retry at depth", depth, " total time:", delta);
        }
    }
    this.move(mv[0], mv[1]);
};

_chessgame_proto.display_move_text = function(moveno, string){
    var mn;
    if ((moveno & 1) == 0){
        mn = '    ';
    }
    else{
        mn = ((moveno >> 1) + 1) + ' ';
        while(mn.length < 4)
            mn = ' ' + mn;
    }
    this.log(mn + string, "chessgame-log-move",
             function (chessgame, n){
                 return function(e){
                     chessgame.goto_move(n);
                 };
             }(this, moveno));
};

_chessgame_proto.log = function(msg, klass, onclick){
    var div = this.elements.log;
    var item = chessgame_new_child(div, "div");
    item.className = klass;
    if (onclick !== undefined)
        _add_event_listener(item, "click", onclick);
    item.innerHTML = msg;
    div.scrollTop = 999999;
}

_chessgame_proto.goto_move = function(n){
    var delta;
    if (n < 0)
        delta = -n;
    else
        delta = this.board_state.moveno - n;
    if (delta > this.board_state.moveno)
        delta = this.board_state.moveno;
    var div = this.elements.log;
    for (var i = 0; i < delta; i++){
        div.removeChild(div.lastChild);
    }
    this.stop_moving_piece();
    this.board_state.jump_to_moveno(n);
    this.refresh();
    this.next_move();
};

_chessgame_proto.refresh = function(){
    var pieces = this.elements.pieces;
    var board = this.board_state.board;
    for (var i = 20; i < 100; i++){
        if(board[i] != CHESSGAME_EDGE){
            var j = this.orientation ? 119 - i : i;
            pieces[j].src = CHESSGAME_IMAGE_DIR + '/' + CHESSGAME_IMAGE_NAMES[board[i]];
        }
    }
};

_chessgame_proto.start_moving_piece = function(position){

    this.stop_moving_piece();
    var img = this.elements.pieces[this.orientation ? 119 - position : position];
    this.elements.moving_img = img;
    var old_msie = /MSIE [56]/.test(navigator.userAgent);
    img.style.position = (old_msie) ? 'absolute': 'fixed';
    var yoffset = parseInt(CHESSGAME_SQUARE_HEIGHT / 2);
    if (window.event){
        img.style.left = (window.event.clientX + 1) + "px";
        img.style.top = (window.event.clientY - yoffset) + "px";
    }
    this.start = position;
    this.show_dots(position);
    document.onmousemove = function(e){
        e = e || window.event;
        img.style.left = (e.clientX + 1) + "px";
        img.style.top = (e.clientY - yoffset) + "px";
    };
};

_chessgame_proto.stop_moving_piece = function(){
    var img = this.elements.moving_img;
    if (img){
        img.style.position = 'static';
        img.style.left = "auto";
        img.style.top = "auto";
    }
    this.start = 0;
    this.elements.moving_img = undefined;
    document.onmousemove = null;
    this.hide_dots();
};

_chessgame_proto.show_dots = function(start){
    var state = this.board_state;
    var colour = state.to_play;
    chessgame_maybe_prepare(state);
    var moves = chessgame_parse(state, colour, state.enpassant, 0);
    for (var i = 0; i < moves.length; i++){
        if (moves[i][1] == start){
            var end = moves[i][2];
            var piece_there = state.board[end];
            var change = chessgame_make_move(state, start, end, CHESSGAME_QUEEN);
            var in_check = chessgame_check_check(state, colour);
            chessgame_unmake_move(state, change);
            if (in_check == false){
                var td = this.elements.squares[this.orientation ? 119 - end : end];
                if (piece_there)
                    td.classList.add(CHESSGAME_CAPTURE_DOT);
                else
                    td.classList.add(CHESSGAME_DOT);
            }
        }
    }
};

_chessgame_proto.hide_dots = function(){
    var squares = this.elements.squares;
    for (var y = 9; y > 1; y--){
        for (var x = 1; x < 9; x++){
            squares[y * 10 + x].classList.remove(CHESSGAME_DOT);
            squares[y * 10 + x].classList.remove(CHESSGAME_CAPTURE_DOT);
        }
    }
};

function chessgame_new_child(element, childtag, className){
    var child = document.createElement(childtag);
    element.appendChild(child);
    if (className !== undefined)
        child.className = className;
    return child;
}

_chessgame_proto.write_board_html = function(){
    var div = this.elements.board;
    var pieces = this.elements.pieces = [];
    var squares = this.elements.squares = [];
    var table = chessgame_new_child(div, "table");
    var tbody = chessgame_new_child(table, "tbody");
    for (var y = 9; y > 1; y--){
        var tr = chessgame_new_child(tbody, "tr");
        for(var x = 1;  x < 9; x++){
            var i = y * 10 + x;
            var td = chessgame_new_child(tr, "td");
            squares[i] = td;
            td.className = (x + y) & 1 ? CHESSGAME_BLACK_SQUARE : CHESSGAME_WHITE_SQUARE;
            _add_event_listener(td, 'click',
                                function(chessgame, n){
                                    return function(e){
                                        chessgame.square_clicked(chessgame.orientation ? 119 - n : n);
                                    };
                                }(this, i));
            var img = chessgame_new_child(td, "img");
            pieces[i] = img;
            img.src = CHESSGAME_IMAGE_DIR + '/' + CHESSGAME_IMAGE_NAMES[0];
            img.width= CHESSGAME_SQUARE_WIDTH;
            img.height= CHESSGAME_SQUARE_HEIGHT;
        }
    }
};

_chessgame_proto.refresh_buttons = function(){
    var rf = this.buttons.refreshers;
    for (var i = 0; i < rf.length; i++){
        var x = rf[i];
        x[0].call(this, x[1]);
    }
};

_chessgame_proto.maybe_rotate_board = function(){
    var p = this.players;
    if (p[0] != p[1] && CHESSGAME_ROTATE_BOARD){
        this.orientation = p[0] == 'computer' ? 1 : 0;
        this.refresh();
    }
};

_chessgame_proto.flip_player = function(i){
    this.players[i] = (this.players[i] == 'human') ? 'computer' : 'human';
    this.refresh_buttons();
    this.maybe_rotate_board();
    this.next_move();
};

var CHESSGAME_CONTROLS = [
    {
        onclick_wrap: function(chessgame){
            return function(e){
                chessgame.flip_player(0);
            };
        },
        refresh: function(el){
            var s = this.players[0];
            el.innerHTML = 'white <img src="' + CHESSGAME_IMAGE_DIR + '/' + s + '.png" alt="' + s + '">';
        }
    },
    {
        onclick_wrap: function(chessgame){
            return function(e){
                chessgame.flip_player(1);
            };
        },
        refresh: function(el){
            var s = this.players[1];
            el.innerHTML = 'black <img src="' + CHESSGAME_IMAGE_DIR + '/' + s + '.png" alt="' + s + '">';
        }
    },
    {
        onclick_wrap: function(chessgame){
            return function(e){
                var p = chessgame.players;
                var tmp = p[0];
                p[0] = p[1];
                p[1] = tmp;
                if (p[0] != p[1] && CHESSGAME_ROTATE_BOARD)
                    chessgame.orientation = 1 - chessgame.orientation;

                chessgame.refresh_buttons();
                chessgame.maybe_rotate_board();
                chessgame.next_move();
            };
        },
        refresh: function(el){
            if (this.players[0] != this.players[1])
                el.innerHTML = '<b>swap</b>';
            else
                el.innerHTML = 'swap';
        }
    },
    {
        onclick_wrap: function(chessgame){
            return function(e){
                chessgame.goto_move(-2);
            };
        },
        label: "<b>undo</i>"
    },
    {
        onclick_wrap: function(chessgame){
            return function(e){
                var x = (chessgame.pawn_becomes + 1) % CHESSGAME_PROMOTION_STRINGS.length;
                chessgame.pawn_becomes = x;
                _event_target(e).innerHTML = 'pawn promotes to <b>' + CHESSGAME_PROMOTION_STRINGS[x] + '</b>';
            };
        },
        refresh: function(el){
            el.innerHTML = 'pawn promotes to <b>' + CHESSGAME_PROMOTION_STRINGS[this.pawn_becomes] + '</b>';
        }
    },
    {
        onclick_wrap: function(chessgame){
            return function(e){
                var x = (chessgame.computer_level + 1) % CHESSGAME_LEVELS.length;
                chessgame.computer_level = x;
                _event_target(e).innerHTML = 'computer level: <b>' + CHESSGAME_LEVELS[x] + '</b>';
            };
        },
        refresh: function(el){
            el.innerHTML = 'computer level: <b>' + CHESSGAME_LEVELS[this.computer_level] + '</b>';
        }
    },
    {
        id: 'draw_button',
        label: '<b>Draw?</b>',
        onclick_wrap: function(chessgame){
            return function(e){
                window.clearTimeout(chessgame.next_move_timeout);
                window.clearTimeout(chessgame.auto_play_timeout);
                chessgame.refresh_buttons();
                chessgame.log('DRAW');
                chessgame_log(chessgame_state2fen(chessgame.board_state));
                chessgame.auto_play_timeout = undefined;
                chessgame.next_move_timeout = undefined;
            };
        },
        move_listener_wrap: function(chessgame){
            return function(move_result){
                var draw_button = chessgame.elements.draw_button;
                if (move_result.flags & CHESSGAME_MOVE_FLAG_DRAW){
                    draw_button.style.display = 'inline-block';
                    if (chessgame.draw_offered || chessgame.draw_offers > 5){
                        draw_button.style.color = '#c00';
                    }
                    chessgame.draw_offered = true;
                    chessgame.draw_offers ++;
                }
                else {
                    chessgame.draw_offered = false;
                    draw_button.style.color = '#000';
                    draw_button.style.display = 'none';
                }
            };
        },
        hidden: true
    }
];

_chessgame_proto.write_controls_html = function(lut){
    var div = this.elements.controls;
    var buttons = this.buttons;
    for (var i = 0; i < lut.length; i++){
        var o = lut[i];
        if (o.debug && ! CHESSGAME_DEBUG)
            continue;
        var span = chessgame_new_child(div, "span");
        span.className = 'chessgame-control-button';
        buttons.elements.push(span);
        _add_event_listener(span, "click",
                            o.onclick_wrap(this));
        if (o.label)
            span.innerHTML = o.label;
        if (o.move_listener_wrap)
            this.move_listeners.push(o.move_listener_wrap(this));
        if (o.hidden)
            span.style.display = 'none';
        if (o.refresh)
            buttons.refreshers.push([o.refresh, span]);
        if (o.id)
            this.elements[o.id] = span;
    }
    this.refresh_buttons();
};

function parse_query(query){
    if (query === undefined)
        query = window.location.search.substring(1);
    if (! query) return [];
    var args = [];
    var re = /([^&=]+)=?([^&]*)/g;
    while (true){
        var match = re.exec(query);
        if (match === null)
            break;
        args.push([decodeURIComponent(match[1].replace(/\+/g, " ")),
                   decodeURIComponent(match[2].replace(/\+/g, " "))]);
    }
    return args;
}

_chessgame_proto.interpret_query_string = function(){

    var attrs = {
        start: function(s){chessgame_fen2state(s, this.board_state)},
        level: function(s){this.computer_level = parseInt(s)},
        player: function(s){
            var players = {
                white: ['human', 'computer'],
                black: ['computer', 'human'],
                both: ['human', 'human'],
                neither: ['computer', 'computer']
            }[s.toLowerCase()];
            if (players !== undefined){
                this.players = players;
                this.maybe_rotate_board();
            }
        },
        debug: function(s){CHESSGAME_DEBUG = parseInt(s)}
    };
    var i;
    var query = parse_query();
    for (i = 0; i < query.length; i++){
        var p = query[i];
        var fn = attrs[p[0]];
        if (fn !== undefined && attrs.hasOwnProperty(p[0])){
            fn.call(this, p[1]);
            this.refresh_buttons();
        }
    }
};

function Chessgame_display(target){
    if (! this instanceof Chessgame_display){
        return new Chessgame_display(target);
    }
    var container;
    if (typeof(target) == 'string')
        container = document.getElementById(target);
    else if (target.jquery !== undefined)
        container = target.get(0);
    else
        container = target;
    var inner = chessgame_new_child(container, "div", CHESSGAME_WRAPPER_CLASS);
    this.elements = {};
    this.elements.inner = inner;
    this.elements.container = container;
    var board = this.elements.board = chessgame_new_child(inner, "div", CHESSGAME_BOARD_CLASS);
    var log = this.elements.log = chessgame_new_child(inner, "div", CHESSGAME_LOG_CLASS);
    this.elements.messages = chessgame_new_child(inner, "div", CHESSGAME_MESSAGES_CLASS);
    this.elements.controls = chessgame_new_child(container, "div", CHESSGAME_CONTROLS_CLASS);
    this.start = 0;
    this.draw_offers = 0;
    this.board_state = chessgame_new_game();
    this.players = ['human', 'computer'];
    this.pawn_becomes = 0;
    this.computer_level = CHESSGAME_DEFAULT_LEVEL;
    this.buttons = {
        elements: [],
        refreshers: []
    };
    this.move_listeners = [];
    return this;
}

_chessgame_proto.render_elements = function(square_height, square_width){
    var e = this.elements;
    var board_height = (8 * (square_height + 3)) + 'px';
    e.inner.style.height = board_height;
    e.log.style.height = board_height;
    e.board.style.height = board_height;
    e.controls.style.width = (11 * square_width) + 'px';
}

function chessgameify(id){
    var chessgame = new Chessgame_display(id);
    chessgame.render_elements(CHESSGAME_SQUARE_HEIGHT, CHESSGAME_SQUARE_WIDTH);
    chessgame.write_board_html();
    chessgame.write_controls_html(CHESSGAME_CONTROLS);
    chessgame.interpret_query_string();
    chessgame.refresh();
    return chessgame;
}

Chessgame_display.prototype = _chessgame_proto;
