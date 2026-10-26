var chessgame_log;
if (this.imports !== undefined &&
    this.printerr !== undefined){
    chessgame_log = function(){
        var args = Array.prototype.slice.call(arguments);
        printerr(args.join(', '));
    };
}
else if (this.console === undefined){
    chessgame_log = function(){};
}
else {
    chessgame_log = function(){console.log.apply(console, arguments);};
}

if (Date.now === undefined)
    Date.now = function(){return (new Date).getTime();};

var CHESSGAME_PAWN = 2, CHESSGAME_ROOK = 4, CHESSGAME_KNIGHT = 6, CHESSGAME_BISHOP = 8, CHESSGAME_QUEEN = 12, CHESSGAME_KING = 10;
var CHESSGAME_EDGE = 16;

var CHESSGAME_MOVES = [[], [],
                [], [],
                [1,10,-1,-10], [],
                [21,19,12,8,-21,-19,-12,-8], [],
                [11,9,-11,-9], [],
                [1,10,11,9,-1,-10,-11,-9], [],
                [1,10,11,9,-1,-10,-11,-9], []
               ];

var CHESSGAME_VALUES=[0, 0,
               20, 20,
               100, 100,
               60, 60,
               61, 61,
               8000, 8000,
               180, 180,
               0];

var CHESSGAME_KING_VALUE = CHESSGAME_VALUES[10];
var CHESSGAME_WIN = CHESSGAME_KING_VALUE >> 1;

var CHESSGAME_WIN_DECAY = 300;
var CHESSGAME_WIN_NOW = CHESSGAME_KING_VALUE - 250;

var CHESSGAME_MAX_SCORE = 9999;
var CHESSGAME_MIN_SCORE = -CHESSGAME_MAX_SCORE;

var CHESSGAME_CENTRALISING_WEIGHTS;
var CHESSGAME_BASE_PAWN_WEIGHTS;
var CHESSGAME_KNIGHT_WEIGHTS;

var CHESSGAME_DEBUG = 0;
var CHESSGAME_INITIAL_BOARD = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 1 1";

var CHESSGAME_USE_TYPED_ARRAYS = this.Int32Array !== undefined;

var CHESSGAME_PIECE_LUT = {
    P: 2,
    p: 3,
    R: 4,
    r: 5,
    N: 6,
    n: 7,
    B: 8,
    b: 9,
    K: 10,
    k: 11,
    Q: 12,
    q: 13
};

var CHESSGAME_ENCODE_LUT = '  PPRRNNBBKKQQ';

function chessgame_alphabeta_treeclimber(state, count, colour, score, s, e, alpha, beta){
    var move = chessgame_make_move(state, s, e, CHESSGAME_QUEEN);
    var i;
    var ncolour = 1 - colour;
    var movelist = chessgame_parse(state, colour, move.ep, -score);
    var movecount = movelist.length;
    if(count){

        var t;
        for(i = 0; i < movecount; i++){
            var mv = movelist[i];
            var mscore = mv[0];
            var ms = mv[1];
            var me = mv[2];
            if (mscore > CHESSGAME_WIN){
                alpha = CHESSGAME_KING_VALUE;
                break;
            }
            t = -chessgame_alphabeta_treeclimber(state, count - 1, ncolour, mscore, ms, me,
                                          -beta, -alpha);
            if (t > alpha){
                alpha = t;
            }
            if (alpha >= beta){
                break;
            }
        }
        if (alpha < -CHESSGAME_WIN_NOW && ! chessgame_check_check(state, colour)){

            alpha = state.stalemate_scores[colour];
        }
        if (alpha < -CHESSGAME_WIN){

            alpha += CHESSGAME_WIN_DECAY;
        }
    }
    else{

        while(beta > alpha && --movecount != -1){
            if(movelist[movecount][0] > alpha){
                alpha = movelist[movecount][0];
            }
        }
    }
    chessgame_unmake_move(state, move);
    return alpha;
}

function chessgame_prepare(state){
    var i, j, x, y, a;
    var pieces = state.pieces = [[], []];

    var moveno = state.moveno >> 1;
    var board = state.board;

    var earliness_weight = (moveno > 50) ? 0 : parseInt(6 * Math.exp(moveno * -0.07));
    var king_should_hide = moveno < 12;
    var early = moveno < 5;

    var kings = [0, 0];
    var material = [0, 0];
    var best_pieces = [0, 0];
    for(i = 20; i  < 100; i++){
        a = board[i];
        var piece = a & 14;
        var colour = a & 1;
        if(piece){
            pieces[colour].push([a, i]);
            if (piece == CHESSGAME_KING){
                kings[colour] = i;
            }
            else{
                material[colour] += CHESSGAME_VALUES[piece];
                best_pieces[colour] = Math.max(best_pieces[colour], CHESSGAME_VALUES[piece]);
            }
        }
    }

    var draw_likely = (state.draw_timeout > 90 || state.current_repetitions >= 2);
    if (draw_likely)
        chessgame_log("draw likely", state.current_repetitions, state.draw_timeout);
    state.values = [[], []];
    var qvalue = CHESSGAME_VALUES[CHESSGAME_QUEEN];
    var material_sum = material[0] + material[1] + 2 * qvalue;
    var wmul = 2 * (material[1] + qvalue) / material_sum;
    var bmul = 2 * (material[0] + qvalue) / material_sum;
    var multipliers = [wmul, bmul];
    var emptiness = 4 * CHESSGAME_QUEEN / material_sum;
    state.stalemate_scores = [parseInt(0.5 + (wmul - 1) * 2 * qvalue),
                              parseInt(0.5 + (bmul - 1) * 2 * qvalue)];

    for (i = 0; i < CHESSGAME_VALUES.length; i++){
        var v = CHESSGAME_VALUES[i];
        if (v < CHESSGAME_WIN){
            state.values[0][i] = parseInt(v * wmul + 0.5);
            state.values[1][i] = parseInt(v * bmul + 0.5);
        }
        else {
            state.values[0][i] = v;
            state.values[1][i] = v;
        }
    }

    state.best_pieces = [parseInt(best_pieces[0] * wmul + 0.5),
                         parseInt(best_pieces[1] * bmul + 0.5)];

    var kx = [kings[0] % 10, kings[1] % 10];
    var ky = [parseInt(kings[0] / 10), parseInt(kings[1] / 10)];

    var pawn_cols = [[], []];
    for (y = 3; y < 9; y++){
        for (x = 1; x < 9; x++){
            i = y * 10 + x;
            a = board[i];
            if ((a & 14) != CHESSGAME_PAWN)
                continue;
            if ((a & 1) == 0){
                pawn_cols[0][x] = y;
            }
            else if (pawn_cols[1][x] === undefined){
                pawn_cols[1][x] = y;
            }
        }
    }
    var target_king = (moveno >= 20 || material_sum < 5 * qvalue);
    var weights = state.weights;

    for (y = 2; y < 10; y++){
        for (x = 1; x < 9; x++){
            i = y * 10 + x;
            var early_centre = CHESSGAME_CENTRALISING_WEIGHTS[i] * earliness_weight;
            var plateau = CHESSGAME_KNIGHT_WEIGHTS[i];
            for (var c = 0; c < 2; c++){
                var dx = Math.abs(kx[1 - c] - x);
                var dy = Math.abs(ky[1 - c] - y);
                var our_dx = Math.abs(kx[c] - x);
                var our_dy = Math.abs(ky[c] - y);

                var d = Math.max(Math.sqrt(dx * dx + dy * dy), 1) + 1;
                var mul = multipliers[c];
                var mul3 = mul * mul * mul;
                var at_home = y == 2 + c * 7;
                var pawn_home = y == 3 + c * 5;
                var row4 = y == 5 + c;
                var promotion_row = y == 9 - c * 7;
                var get_out = (early && at_home) * -5;

                var knight = parseInt(early_centre * 0.3) + 2 * plateau + get_out;
                var rook = parseInt(early_centre * 0.3);
                var bishop = parseInt(early_centre * 0.6) + plateau + get_out;
                if (at_home){
                    rook += (x == 4 || x == 5) * (earliness_weight + ! target_king);
                    rook += (x == 1 || x == 8) * (moveno > 10 && moveno < 20) * -3;
                    rook += (x == 2 || x == 7) * (moveno > 10 && moveno < 20) * -1;
                }

                var queen = parseInt(plateau * 0.5 + early_centre * (0.5 - early));
                var king = (king_should_hide && at_home) * 2 * earliness_weight;

                var get_on_with_it = Math.max(emptiness * 2, 1);
                var pawn = get_on_with_it * CHESSGAME_BASE_PAWN_WEIGHTS[c ? 119 - i : i];
                if (early){

                    if (y >= 4 && y <= 7){
                        var boost = 1 + 3 * (y == 5 || y == 6);
                        pawn += parseInt((boost + chessgame_random_int(state, 4)) * 0.1 *
                                         early_centre);
                    }
                    if (x == 4 || x == 5){

                        pawn -= 3 * pawn_home;
                        pawn += 3 * row4;
                    }
                }

                if (promotion_row)
                    pawn += state.values[c][CHESSGAME_QUEEN] - state.values[c][CHESSGAME_PAWN];

                pawn += 4 * (y == 3 && ky[c] == 2 && Math.abs(our_dx) < 2 &&
                             kx[c] != 5 && x != 4 && x != 5);

                var cols = pawn_cols[1 - c];
                if (cols[x] == undefined ||
                    (c == 0 && cols[x] < y) ||
                    (c == 1 && cols[x] > y))
                    pawn += 2;

                if (target_king){
                    knight += 2 * parseInt(8 * mul / d);
                    rook += 2 * ((dx < 2) + (dy < 2));
                    bishop += 3 * (Math.abs((dx - dy))  < 2);
                    queen += 2 * parseInt(8 / d) + (dx * dy == 0) + (dx - dy == 0);

                    var king_centre_wt = 8 * emptiness * CHESSGAME_CENTRALISING_WEIGHTS[i];
                    king += parseInt(150 * emptiness / (mul3 * d) + king_centre_wt * mul3);
                }
                weights[CHESSGAME_PAWN + c][i] = pawn;
                weights[CHESSGAME_KNIGHT + c][i] = knight;
                weights[CHESSGAME_ROOK + c][i] = rook;
                weights[CHESSGAME_BISHOP + c][i] = bishop;
                weights[CHESSGAME_QUEEN + c][i] = queen;
                weights[CHESSGAME_KING + c][i] = king;

                if (draw_likely && mul < 1){

                    var range = 3 / mul3;
                    for (j = 2 + c; j < 14; j += 2){
                        weights[j][i] += chessgame_random_int(state, range);
                    }
                }
            }
        }
    }
    state.prepared = true;
}

function chessgame_maybe_prepare(state){
    if (! state.prepared)
        chessgame_prepare(state);
}

function chessgame_parse(state, colour, ep, score) {
    var board = state.board;
    var s, e;
    var E, a;
    var i, j;
    var other_colour = 1 - colour;
    var dir = (10 - 20 * colour);
    var movelist = [];
    var captures = [];
    var weight;
    var pieces = state.pieces[colour];
    var castle_flags = (state.castles >> (colour * 2)) & 3;
    var values = state.values[other_colour];
    var all_weights = state.weights;
    for (j = pieces.length - 1; j >= 0; j--){
        s = pieces[j][1];
        a = board[s];
        var weight_lut = all_weights[a];
        weight = score - weight_lut[s];
        a &= 14;
        if(a > 2){
            var moves = CHESSGAME_MOVES[a];
            if(a & 2){
                for(i = 0; i < 8; i++){
                    e = s + moves[i];
                    E = board[e];
                    if(!E){
                        movelist.push([weight + values[E] + weight_lut[e], s, e]);
                    }
                    else if((E&17)==other_colour){
                        captures.push([weight + values[E] + weight_lut[e] + all_weights[E][e], s, e]);
                    }
                }
                if(a == CHESSGAME_KING && castle_flags){
                    if((castle_flags & 1) &&
                        (board[s - 1] + board[s - 2] + board[s - 3] == 0) &&
                        chessgame_check_castling(board, s - 2, other_colour, dir, -1)){
                        movelist.push([weight + 12, s, s - 2]);
                    }
                    if((castle_flags & 2) && (board[s + 1] + board[s + 2] == 0) &&
                        chessgame_check_castling(board, s, other_colour, dir, 1)){
                        movelist.push([weight + 13, s, s + 2]);
                    }
                }
            }
            else{
                var mlen = moves.length;
                for(i=0;i<mlen;){
                    var m = moves[i++];
                    e=s;
                    do {
                        e+=m;
                        E=board[e];
                        if(!E){
                            movelist.push([weight + values[E] + weight_lut[e], s, e]);
                        }
                        else if((E&17)==other_colour){
                            captures.push([weight + values[E] + weight_lut[e] + all_weights[E][e], s, e]);
                        }
                    }while(!E);
                }
            }
        }
        else{
            e=s+dir;
            if(!board[e]){
                movelist.push([weight + weight_lut[e], s, e]);

                var e2 = e + dir;
                if(s * (120 - s) < 3200 && (!board[e2])){
                    movelist.push([weight + weight_lut[e2], s, e2]);
                }
            }

            E = board[--e];
            if(E && (E & 17) == other_colour){
                captures.push([weight + values[E] + weight_lut[e] + all_weights[E][e], s, e]);
            }
            e += 2;
            E = board[e];
            if(E && (E & 17) == other_colour){
                captures.push([weight + values[E] + weight_lut[e] + all_weights[E][e], s, e]);
            }
        }
    }
    if(ep){
        var pawn = CHESSGAME_PAWN | colour;
        var taken;

        s = ep - dir - 1;
        if (board[s] == pawn){
            taken = values[CHESSGAME_PAWN] + all_weights[CHESSGAME_PAWN | other_colour][ep - dir];
            captures.push([score - weight_lut[s] + weight_lut[ep] + taken, s, ep]);
        }
        s += 2;
        if (board[s] == pawn){
            taken = values[CHESSGAME_PAWN] + all_weights[CHESSGAME_PAWN | other_colour][ep - dir];
            captures.push([score - weight_lut[s] + weight_lut[ep] + taken, s, ep]);
        }
    }
    return captures.concat(movelist);
}

function chessgame_check_castling(board, s, colour, dir, side){
    var e;
    var E;
    var m, p;
    var knight = colour + CHESSGAME_KNIGHT;
    var diag_slider = CHESSGAME_BISHOP | colour;
    var diag_mask = 27;
    var grid_slider = CHESSGAME_ROOK | colour;
    var king_pawn = 2 | colour;
    var grid_mask = 23;

    for(p = s; p < s + 3; p++){

        e = p;
        do{
            e += dir;
            E=board[e];
        } while (! E);
        if((E & grid_mask) == grid_slider)
            return 0;
        e = p;
        var delta = dir - 1;
        do{
            e += delta;
            E=board[e];
        } while (! E);
        if((E & diag_mask) == diag_slider)
            return 0;
        e = p;
        delta += 2;
        do{
            e += delta;
            E=board[e];
        } while (! E);
        if((E & diag_mask) == diag_slider)
            return 0;

        if (board[p + dir - 2] == knight ||
            board[p + dir + 2] == knight)
            return 0;
    }

    for(p = s + dir - 1; p < s + dir + 4; p++){
        E = board[p] & grid_mask;
        if(E == king_pawn || board[p + dir] == knight)
            return 0;
    }

    e = (side < 0) ? s + 2 : s;
    do {
        e -= side;
        E=board[e];
    } while (! E);
    if((E & grid_mask) == grid_slider)
        return 0;

    return 1;
}

function chessgame_check_check(state, colour){
    var board = state.board;

    var pieces = state.pieces[colour];
    var p;
    var i = pieces.length;
    do {
        p = pieces[--i];
    } while (p[0] != (CHESSGAME_KING | colour));
    var s = p[1];
    var other_colour = 1 - colour;
    var dir = 10 - 20 * colour;
    if (board[s + dir - 1] == (CHESSGAME_PAWN | other_colour) ||
        board[s + dir + 1] == (CHESSGAME_PAWN | other_colour))
        return true;
    var knight_moves = CHESSGAME_MOVES[CHESSGAME_KNIGHT];
    var king_moves = CHESSGAME_MOVES[CHESSGAME_KING];
    var knight = CHESSGAME_KNIGHT | other_colour;
    var king = CHESSGAME_KING | other_colour;
    for (i = 0; i < 8; i++){
        if (board[s + knight_moves[i]] == knight ||
            board[s + king_moves[i]] == king)
            return true;
    }
    var diagonal_moves = CHESSGAME_MOVES[CHESSGAME_BISHOP];
    var grid_moves = CHESSGAME_MOVES[CHESSGAME_ROOK];

    var diag_slider = CHESSGAME_BISHOP | other_colour;
    var diag_mask = 27;
    var grid_slider = CHESSGAME_ROOK | other_colour;
    var grid_mask = 23;
    for (i = 0; i < 4; i++){
        var m = diagonal_moves[i];
        var e = s;
        var E;
        do {
            e += m;
            E = board[e];
        } while (!E);
        if((E & diag_mask) == diag_slider)
            return true;

        m = grid_moves[i];
        e = s;
        do {
            e += m;
            E = board[e];
        } while (!E);
        if((E & grid_mask) == grid_slider)
            return true;
    }
    return false;
}

function chessgame_optimise_piece_list(state){
    var i, p, s, e;
    var movelists = [
        chessgame_parse(state, 0, 0, 0),
        chessgame_parse(state, 1, 0, 0)
    ];
    var weights = state.weights;
    var board = state.board;
    for (var colour = 0; colour < 2; colour++){
        var our_values = state.values[colour];
        var pieces = state.pieces[colour];
        var movelist = movelists[colour];
        var threats = movelists[1 - colour];

        var scores = [];
        for (i = 0; i < pieces.length; i++){
            p = pieces[i];
            scores[p[1]] = {
                score: 0,
                piece: p[0],
                pos: p[1],
                threatened: 0
            };
        }

        for(i = movelist.length - 1; i >= 0; i--){
            var mv = movelist[i];
            var score = mv[0];
            s = mv[1];
            e = mv[2];
            if(! board[e]){
                var x = scores[s];
                x.score = Math.max(x.score, score);
            }
        }

        for(i = threats.length - 1; i >= 0; i--){
            var mv = threats[i];
            var x = scores[mv[2]];
            if (x !== undefined){
                var S = board[mv[1]];
                var r = (1 + x.piece > 3 + S < 4) * 0.01;
                if (x.threatened < r)
                    x.threatened = r;
            }
        }
        var pieces2 = [];
        for (i = 20; i < 100; i++){
            p = scores[i];
            if (p !== undefined){
                p.score += p.threatened * our_values[p.piece];
                pieces2.push(p);
            }
        }
        pieces2.sort(function(a, b){return a.score - b.score;});
        for (i = 0; i < pieces2.length; i++){
            p = pieces2[i];
            pieces[i] = [p.piece, p.pos];
        }
    }
}

function chessgame_findmove(state, level, colour, ep){
    chessgame_prepare(state);
    chessgame_optimise_piece_list(state);
    var board = state.board;
    if (arguments.length == 2){
        colour = state.to_play;
        ep = state.enpassant;
    }
    var movelist = chessgame_parse(state, colour, ep, 0);
    var alpha = CHESSGAME_MIN_SCORE;
    var mv, t, i;
    var bs = 0;
    var be = 0;

    if (level <= 0){
        for (i = 0; i < movelist.length; i++){
            mv = movelist[i];
            if(movelist[i][0] > alpha){
                alpha = mv[0];
                bs = mv[1];
                be = mv[2];
            }
        }
        return [bs, be, alpha];
    }

    for(i = 0; i < movelist.length; i++){
        mv = movelist[i];
        var mscore = mv[0];
        var ms = mv[1];
        var me = mv[2];
        if (mscore > CHESSGAME_WIN){
            chessgame_log("XXX taking king! it should never come to this");
            alpha = CHESSGAME_KING_VALUE;
            bs = ms;
            be = me;
            break;
        }
        t = -state.treeclimber(state, level - 1, 1 - colour, mscore, ms, me,
                               CHESSGAME_MIN_SCORE, -alpha);
        if (t > alpha){
            alpha = t;
            bs = ms;
            be = me;
        }
    }
    if (alpha < -CHESSGAME_WIN_NOW && ! chessgame_check_check(state, colour)){
        alpha = state.stalemate_scores[colour];
    }
    return [bs, be, alpha];
}

function chessgame_make_move(state, s, e, promotion){
    var board = state.board;
    var S = board[s];
    var E = board[e];
    board[e] = S;
    board[s] = 0;
    var piece = S & 14;
    var moved_colour = S & 1;
    var end_piece = S;

    var rs = 0, re, rook;
    var ep_taken = 0, ep_position;
    var ep = 0;
    if(piece == CHESSGAME_PAWN){
        if((60 - e) * (60 - e) > 900){

            promotion |= moved_colour;
            board[e] = promotion;
            end_piece = promotion;
        }
        else if (((s ^ e) & 1) && E == 0){

            ep_position = e - 10 + 20 * moved_colour;
            ep_taken = board[ep_position];
            board[ep_position] = 0;
        }
        else if ((s - e) * (s - e) == 400){

            ep = (s + e) >> 1;
        }
    }
    else if (piece == CHESSGAME_KING && ((s - e) * (s - e) == 4)){
        rs = s - 4 + (s < e) * 7;
        re = (s + e) >> 1;
        rook = moved_colour + CHESSGAME_ROOK;
        board[rs] = 0;
        board[re] = rook;

    }

    var old_castle_state = state.castles;
    if (old_castle_state){
        var mask = 0;
        var shift = moved_colour * 2;
        var side = moved_colour * 70;
        var s2 = s - side;
        var e2 = e + side;

        if (s2 == 25)
            mask |= 3 << shift;

        else if (s2 == 21)
            mask |= 1 << shift;
        else if (s2 == 28)
            mask |= 2 << shift;

        if (e2 == 91)
            mask |= 4 >> shift;
        else if (e2 == 98)
            mask |= 8 >> shift;
        state.castles &= ~mask;
    }

    var old_pieces = state.pieces.concat();
    var our_pieces = old_pieces[moved_colour];
    var dest = state.pieces[moved_colour] = [];
    for (var i = 0; i < our_pieces.length; i++){
        var x = our_pieces[i];
        var pp = x[0];
        var ps = x[1];
        if (ps != s && ps != rs){
            dest.push(x);
        }
    }
    dest.push([end_piece, e]);
    if (rook)
        dest.push([rook, re]);

    if (E || ep_taken){
        var their_pieces = old_pieces[1 - moved_colour];
        dest = state.pieces[1 - moved_colour] = [];
        var gone = ep_taken ? ep_position : e;
        for (i = 0; i < their_pieces.length; i++){
            var x = their_pieces[i];
            if (x[1] != gone){
                dest.push(x);
            }
        }
    }

    return {

        s: s,
        e: e,
        S: S,
        E: E,
        ep: ep,
        castles: old_castle_state,
        rs: rs,
        re: re,
        rook: rook,
        ep_position: ep_position,
        ep_taken: ep_taken,
        pieces: old_pieces
    };
}

function chessgame_unmake_move(state, move){
    var board = state.board;
    if (move.ep_position){
        board[move.ep_position] = move.ep_taken;
    }
    board[move.s] = move.S;
    board[move.e] = move.E;

    if(move.rs){
        board[move.rs] = move.rook;
        board[move.re] = 0;

    }
    state.pieces = move.pieces;
    state.castles = move.castles;
}

function chessgame_insufficient_material(state){
    var knights = false;
    var bishops = undefined;
    var i;
    var board = state.board;
    for(i = 20; i  < 100; i++){
        var piece = board[i] & 14;
        if(piece == 0 || piece == CHESSGAME_KING){
            continue;
        }
        if (piece == CHESSGAME_KNIGHT){

            if (knights || bishops !== undefined){
                return false;
            }
            knights = true;
        }
        else if (piece == CHESSGAME_BISHOP){

            var x = i & 1;
            var y = parseInt(i / 10) & 1;
            var parity = x ^ y;
            if (knights){
                return false;
            }
            else if (bishops === undefined){
                bishops = parity;
            }
            else if (bishops != parity){
                return false;
            }
        }
        else {
             return false;
        }
    }
    return true;
}

var CHESSGAME_MOVE_FLAG_OK = 1;
var CHESSGAME_MOVE_FLAG_CHECK = 2;
var CHESSGAME_MOVE_FLAG_MATE = 4;
var CHESSGAME_MOVE_FLAG_CAPTURE = 8;
var CHESSGAME_MOVE_FLAG_CASTLE_KING = 16;
var CHESSGAME_MOVE_FLAG_CASTLE_QUEEN = 32;
var CHESSGAME_MOVE_FLAG_DRAW = 64;

var CHESSGAME_MOVE_ILLEGAL = 0;
var CHESSGAME_MOVE_MISSED_MATE = CHESSGAME_MOVE_FLAG_CHECK | CHESSGAME_MOVE_FLAG_MATE;
var CHESSGAME_MOVE_CHECKMATE = CHESSGAME_MOVE_FLAG_OK | CHESSGAME_MOVE_FLAG_CHECK | CHESSGAME_MOVE_FLAG_MATE;
var CHESSGAME_MOVE_STALEMATE = CHESSGAME_MOVE_FLAG_OK | CHESSGAME_MOVE_FLAG_MATE;

function chessgame_move(state, s, e, promotion){
    var board = state.board;
    var colour = state.to_play;
    var other_colour = 1 - colour;
    if (s != parseInt(s)){
        if (e === undefined){
            var mv = chessgame_interpret_movestring(state, s);
            s = mv[0];
            e = mv[1];
            if (s == 0)
                return {flags: CHESSGAME_MOVE_ILLEGAL, ok: false};
            promotion = mv[2];
        }
        else {
            s = chessgame_destringify_point(s);
            e = chessgame_destringify_point(e);
        }
    }
    if (promotion === undefined)
        promotion = CHESSGAME_QUEEN;
    var E=board[e];
    var S=board[s];

    var i;
    var legal = false;
    chessgame_maybe_prepare(state);
    var moves = chessgame_parse(state, colour, state.enpassant, 0);
    for (i = 0; i < moves.length; i++){
        if (e == moves[i][2] && s == moves[i][1]){
            legal = true;
            break;
        }
    }
    if (! legal) {
        return {flags: CHESSGAME_MOVE_ILLEGAL, ok: false};
    }

    var changes = chessgame_make_move(state, s, e, promotion);

    if (chessgame_check_check(state, colour)){
        chessgame_unmake_move(state, changes);
        chessgame_log('in check', changes);
        return {flags: CHESSGAME_MOVE_ILLEGAL, ok: false, string: "in check!"};
    }

    var flags = CHESSGAME_MOVE_FLAG_OK;

    state.enpassant = changes.ep;
    state.history.push([s, e, promotion]);

    if (changes.E || changes.ep_position){
        state.draw_timeout = 0;
        flags |= CHESSGAME_MOVE_FLAG_CAPTURE;
    }
    else if ((S & 14) == CHESSGAME_PAWN){
        state.draw_timeout = 0;
    }
    else{
        state.draw_timeout++;
    }
    if (changes.rs){
        flags |= (s > e) ? CHESSGAME_MOVE_FLAG_CASTLE_QUEEN : CHESSGAME_MOVE_FLAG_CASTLE_KING;
    }
    var shortfen = chessgame_state2fen(state, true);
    var repetitions = (state.position_counts[shortfen] || 0) + 1;
    state.position_counts[shortfen] = repetitions;
    state.current_repetitions = repetitions;
    if (state.draw_timeout > 100 || repetitions >= 3 ||
        chessgame_insufficient_material(state)){
        flags |= CHESSGAME_MOVE_FLAG_DRAW;
    }
    state.moveno++;
    state.to_play = other_colour;

    if (chessgame_check_check(state, other_colour)){
        flags |= CHESSGAME_MOVE_FLAG_CHECK;
    }

    var is_mate = true;
    var replies = chessgame_parse(state, other_colour, changes.ep, 0);
    for (i = 0; i < replies.length; i++){
        var m = replies[i];
        var change2 = chessgame_make_move(state, m[1], m[2], CHESSGAME_QUEEN);
        var check = chessgame_check_check(state, other_colour);
        chessgame_unmake_move(state, change2);
        if (!check){
            is_mate = false;
            break;
        }
    }
    if (is_mate)
        flags |= CHESSGAME_MOVE_FLAG_MATE;

    var movestring = chessgame_move2string(state, s, e, S, promotion, flags, moves);
    chessgame_log("successful move", s, e, movestring, flags);
    state.prepared = false;
    return {
        flags: flags,
        string: movestring,
        ok: true
    };
}

function chessgame_move2string(state, s, e, S, promotion, flags, moves){
    var piece = S & 14;
    var src, dest;
    var mv, i;
    var capture = flags & CHESSGAME_MOVE_FLAG_CAPTURE;

    src = chessgame_stringify_point(s);
    dest = chessgame_stringify_point(e);
    if (piece == CHESSGAME_PAWN){
        if (capture){
            mv = src.charAt(0) + 'x' + dest;
        }
        else
            mv = dest;
        if (e > 90 || e < 30){
            if (promotion === undefined)
                promotion = CHESSGAME_QUEEN;
            mv += '=' + CHESSGAME_ENCODE_LUT.charAt(promotion);
        }
    }
    else if (piece == CHESSGAME_KING && (s-e) * (s-e) == 4) {
        if (e < s)
            mv = 'O-O-O';
        else
            mv = 'O-O';
    }
    else {
        var row_qualifier = '';
        var col_qualifier = '';
        var pstr = CHESSGAME_ENCODE_LUT.charAt(S);
        var sx = s % 10;
        var sy = parseInt(s / 10);

        var co_landers = [];
        for (i = 0; i < moves.length; i++){
            var m = moves[i];
            if (e == m[2] && s != m[1] && state.board[m[1]] == S){
                co_landers.push(m[1]);
            }
        }
        if (co_landers.length){
            for (i = 0; i < co_landers.length; i++){
                var c = co_landers[i];
                var cx = c % 10;
                var cy = parseInt(c / 10);
                if (cx == sx)
                    row_qualifier = src.charAt(1);
                if (cy == sy)
                    col_qualifier = src.charAt(0);
            }
            if (row_qualifier == '' && col_qualifier == ''){

                col_qualifier = src.charAt(0);
            }
        }
        mv = pstr + col_qualifier + row_qualifier + (capture ? 'x' : '') + dest;
    }
    if (flags & CHESSGAME_MOVE_FLAG_CHECK){
        if (flags & CHESSGAME_MOVE_FLAG_MATE)
            mv += '#';
        else
            mv += '+';
    }
    else if (flags & CHESSGAME_MOVE_FLAG_MATE)
        mv += ' stalemate';
    return mv;
}

function chessgame_jump_to_moveno(state, moveno){
    chessgame_log('jumping to move', moveno);
    if (moveno === undefined || moveno > state.moveno)
        moveno = state.moveno;
    else if (moveno < 0){
        moveno = state.moveno + moveno;
    }
    var state2 = chessgame_fen2state(state.beginning);
    var i = 0;
    while (state2.moveno < moveno){
        var m = state.history[i++];
        chessgame_move(state2, m[0], m[1], m[2]);
    }

    var attr, dest;
    for (attr in state2){
        var src = state2[attr];
        if (attr instanceof Array){
            dest = state[attr];
            dest.length = 0;
            for (i = 0; i < src.length; i++){
                dest[i] = src[i];
            }
        }
        else {
            state[attr] = src;
        }
    }
    state.prepared = false;
}

function chessgame_state2fen(state, reduced){
    var piece_lut = '  PpRrNnBbKkQq';
    var board = state.board;
    var fen = '';

    for (var y = 9; y > 1; y--){
        var count = 0;
        for (var x = 1; x < 9; x++){
            var piece = board[y * 10 + x];
            if (piece == 0)
                count++;
            else{
                if (count)
                    fen += count.toString();
                fen += piece_lut.charAt(piece);
                count = 0;
            }
        }
        if (count)
            fen += count;
        if (y > 2)
            fen += '/';
    }

    fen += ' ' + 'wb'.charAt(state.to_play) + ' ';

    if (state.castles){
        var lut = [2, 'K', 1, 'Q', 8, 'k', 4, 'q'];
        for (var i = 0; i < 8; i += 2){
            if (state.castles & lut[i]){
                fen += lut[i + 1];
            }
        }
    }
    else
        fen += '-';

    if (state.enpassant !== 0){
        fen += ' ' + chessgame_stringify_point(state.enpassant);
    }
    else
        fen += ' -';
    if (reduced){

        return fen;
    }
    fen += ' ' + state.draw_timeout + ' ';
    fen += (state.moveno >> 1) + 1;
    return fen;
}

function chessgame_stringify_point(p){
    var letters = " abcdefgh";
    var x = p % 10;
    var y = (p - x) / 10 - 1;
    return letters.charAt(x) + y;
}

function chessgame_destringify_point(p){
    var x = parseInt(p.charAt(0), 19) - 9;
    var y = parseInt(p.charAt(1)) + 1;
    if (y >= 2 && y < 10 && x >= 1 && x < 9)
        return y * 10 + x;
    return undefined;
}

function chessgame_fen2state(fen, state){
    if (state === undefined)
        state = chessgame_initialise_state();
    var board = state.board;
    var fenbits = fen.split(' ');
    var fen_board = fenbits[0];
    var fen_toplay = fenbits[1];
    var fen_castles = fenbits[2];
    var fen_enpassant = fenbits[3];
    var fen_timeout = fenbits[4];
    var fen_moveno = fenbits[5];
    if (fen_timeout === undefined)
        fen_timeout = 0;

    var y = 90;
    var x = 1;
    var i, c;
    for (var j = 0; j < fen_board.length; j++){
        c = fen_board.charAt(j);
        if (c == '/'){
            x = 1;
            y -= 10;
            if (y < 20)
                break;
            continue;
        }
        var piece = CHESSGAME_PIECE_LUT[c];
        if (piece && x < 9){
            board[y + x] = piece;
            x++;
        }
        else {
            var end = Math.min(x + parseInt(c), 9);
            for (; x < end; x++){
                board[y + x] = 0;
            }
        }
    }
    state.to_play = (fen_toplay.toLowerCase() == 'b') ? 1 : 0;
    state.castles = 0;

    var wk = board[25] == CHESSGAME_KING;
    var bk = board[95] == CHESSGAME_KING + 1;
    var castle_lut = {
        k: 8 * (bk && board[98] == CHESSGAME_ROOK + 1),
        q: 4 * (bk && board[91] == CHESSGAME_ROOK + 1),
        K: 2 * (wk && board[28] == CHESSGAME_ROOK),
        Q: 1 * (wk && board[21] == CHESSGAME_ROOK)
    };
    for (i = 0; i < fen_castles.length; i++){
        c = fen_castles.charAt(i);
        var castle = castle_lut[c];
        if (castle !== undefined){
            state.castles |= castle;
            if (castle == 0){
                console.log("FEN claims castle state " + fen_castles +
                            " but pieces are not in place for " + c);
            }
        }
    }

    state.enpassant = (fen_enpassant != '-') ? chessgame_destringify_point(fen_enpassant) : 0;
    state.draw_timeout = parseInt(fen_timeout);
    if (fen_moveno === undefined){

        var pieces = 0;
        var mix = 0;
        var p, q, r;
        for (y = 20; y < 100; y+=10){
            for (x = 1; x < 9; x++){
                p = board[y + x] & 15;
                pieces += (!!p);
                if (x < 8){
                    q = board[y + x + 1];
                    mix += (!q) != (!p);
                }
                if (y < 90){
                    q = board[y + x + 10];
                    mix += (!q) != (!p);
                }
            }
        }
        fen_moveno = Math.max(1, parseInt((32 - pieces) * 1.3 + (4 - fen_castles.length) * 1.5 + ((mix - 16) / 5)));

    }
    state.moveno = 2 * (parseInt(fen_moveno) - 1) + state.to_play;
    state.history = [];
    state.beginning = fen;
    state.prepared = false;
    state.position_counts = {};

    state.move = function(s, e, promotion){
        return chessgame_move(this, s, e, promotion);
    };
    state.findmove = function(level){
        return chessgame_findmove(this, level);
    };
    state.jump_to_moveno = function(moveno){
        return chessgame_jump_to_moveno(this, moveno);
    };
    return state;
}

var CHESSGAME_ZEROS = [];
function chessgame_zero_array(){
    if (CHESSGAME_USE_TYPED_ARRAYS)
        return new Int32Array(120);
    if (CHESSGAME_ZEROS.length == 0){
        for(var i = 0; i < 120; i++){
            CHESSGAME_ZEROS[i] = 0;
        }
    }
    return CHESSGAME_ZEROS.slice();
}

function chessgame_initialise_state(){
    var board = chessgame_zero_array();
    CHESSGAME_CENTRALISING_WEIGHTS = chessgame_zero_array();
    CHESSGAME_BASE_PAWN_WEIGHTS = chessgame_zero_array();
    CHESSGAME_KNIGHT_WEIGHTS = chessgame_zero_array();
    for(var i = 0; i < 120; i++){
        var y = parseInt(i / 10);
        var x = i % 10;
        var dx = Math.abs(x - 4.5);
        var dy = Math.abs(y - 5.5);
        CHESSGAME_CENTRALISING_WEIGHTS[i] = parseInt(6 - Math.pow((dx * dx + dy * dy) * 1.5, 0.6));

        CHESSGAME_KNIGHT_WEIGHTS[i] = parseInt(((dx < 2) + (dy < 2) * 1.5)
                                        + (dx < 3) + (dy < 3)) - 2;
        CHESSGAME_BASE_PAWN_WEIGHTS[i] = parseInt('000012347000'.charAt(y));
        if (y > 9 || y < 2 || x < 1 || x > 8)
            board[i] = 16;
    }
    var weights = [];
    for (i = 0; i < 14; i++){
        weights[i] = chessgame_zero_array();
    }
    var state = {
        board: board,
        weights: weights,
        history: [],
        treeclimber: chessgame_alphabeta_treeclimber
    };
    chessgame_random_seed(state, CHESSGAME_DEBUG ? 1 : Date.now());
    return state;
}

function chessgame_new_game(){
    return chessgame_fen2state(CHESSGAME_INITIAL_BOARD);
}

function chessgame_interpret_movestring(state, str){

    var FAIL = [0, 0];
    var algebraic_re = /^\s*([RNBQK]?[a-h]?[1-8]?)[ :x-]*([a-h][1-8]?)(=[RNBQ])?[!?+#e.p]*\s*$/;
    var castle_re = /^\s*([O0o]-[O0o](-[O0o])?)\s*$/;
    var position_re = /^[a-h][1-8]$/;

    var m = algebraic_re.exec(str);
    if (m == null){

        m = castle_re.exec(str);
        if (m){
            s = 25 + state.to_play * 70;
            if (m[2])
                e = s - 2;
            else
                e = s + 2;
        }
        else
            return FAIL;
    }
    var src = m[1];
    var dest = m[2];
    var queen = m[3];
    var s, e, q;
    var moves, i;
    if (src == '' || src == undefined){

        e = chessgame_destringify_point(dest);
        s = chessgame_find_source_point(state, e, 'P' + dest.charAt(0));
    }
    else if (/^[RNBQK]/.test(src)){

        e = chessgame_destringify_point(dest);
        s = chessgame_find_source_point(state, e, src);
    }
    else if (position_re.test(src) && position_re.test(dest)){
        s = chessgame_destringify_point(src);
        e = chessgame_destringify_point(dest);
    }
    else if (/^[a-h]$/.test(src)){
        e = chessgame_destringify_point(dest);
        s = chessgame_find_source_point(state, e, 'P' + src);
    }
    if (s == 0)
        return FAIL;

    if (queen){

        q = CHESSGAME_PIECE_LUT[queen.charAt(1)];
    }
    return [s, e, q];
}

function chessgame_find_source_point(state, e, str){
    var colour = state.to_play;
    var piece = CHESSGAME_PIECE_LUT[str.charAt(0)];
    piece |= colour;
    var s, i;

    var row, column;

    for (i = 1; i < str.length; i++){
        var c = str.charAt(i);
        if (/[a-h]/.test(c)){
            column = str.charCodeAt(i) - 96;
        }
        else if (/[1-8]/.test(c)){

            row = 1 + parseInt(c);
        }
    }
    var possibilities = [];
    chessgame_prepare(state);
    var moves = chessgame_parse(state, colour,
                         state.enpassant, 0);
    for (i = 0; i < moves.length; i++){
        var mv = moves[i];
        if (e == mv[2]){
            s = mv[1];
            if (state.board[s] == piece &&
                (column === undefined || column == s % 10) &&
                (row === undefined || row == parseInt(s / 10))
               ){
                   var change = chessgame_make_move(state, s, e, CHESSGAME_QUEEN);
                   if (! chessgame_check_check(state, colour))
                       possibilities.push(s);
                   chessgame_unmake_move(state, change);
            }
        }
    }
    chessgame_log("finding", str, "that goes to", e, "got", possibilities);

    if (possibilities.length == 0){
        return 0;
    }
    else if (possibilities.length > 1){
        chessgame_log("chessgame_find_source_point seems to have failed",
               state, e, str,
               possibilities);
    }
    return possibilities[0];
}

function chessgame_random_seed(state, seed){
    seed &= 0xffffffff;
    state.rng = (CHESSGAME_USE_TYPED_ARRAYS) ? new Uint32Array(4) : [];
    state.rng[0] = 0xf1ea5eed;
    state.rng[1] = seed;
    state.rng[2] = seed;
    state.rng[3] = seed;
    for (var i = 0; i < 20; i++)
        chessgame_random31(state);
}

function chessgame_random31(state){
    var rng = state.rng;
    var b = rng[1];
    var c = rng[2];

    var e = rng[0] - ((b << 27) | (b >>> 5));
    rng[0] = b ^ ((c << 17) | (c >>> 15));
    rng[1] = (c + rng[3]) & 0xffffffff;
    rng[2] = (rng[3] + e) & 0xffffffff;
    rng[3] = (e + rng[0]) & 0xffffffff;
    return rng[3] & 0x7fffffff;
}

function chessgame_random_int(state, top){

    var mask = top;
    mask--;
    mask |= mask >>> 1;
    mask |= mask >>> 2;
    mask |= mask >>> 4;
    mask |= mask >>> 8;
    mask |= mask >>> 16;
    var r;
    do{
        r = chessgame_random31(state) & mask;
    } while (r >= top);
    return r;
}
