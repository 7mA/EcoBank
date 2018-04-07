'use strict';

module.exports = function(Cards) {

  /**
   * Validating cards model data
   * bank: must be "Orange" or "Coconut"
   * card_num: do not contains any characters except number
   */
  Cards.validatesInclusionOf('bank', {
    in: ['Orange', 'Coconut'],
    message: 'we support "Orange" bank and "Coconut" bank.'
  });
  Cards.validatesFormatOf('card_num', {
    with: /^[0-9]+/,
    message: 'card number should not contain any non-number characters.'
  });


  Cards.afterRemote('find', function (ctx, unused, next) {
    console.log("cards after remote: after find");

    if(ctx.result){
      if(Array.isArray(ctx.result)){
        ctx.result.forEach(function (card) {
          delete card.query_password;
        })
      }else{
        delete ctx.result.query_password;
      }
    }

    next();
  });

};
