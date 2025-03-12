<?php if (!defined('PmWiki')) exit();
/*  Copyright 2007-2023 Patrick R. Michaud (pmichaud@pobox.com)
    This file is pmform.php; you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published
    by the Free Software Foundation; either version 2 of the License, or
    (at your option) any later version.  

    Script maintained by Petko YOTOV www.pmwiki.org/petko
*/

if (@$_REQUEST['pmform'])
  $MessagesFmt[] = 
    "<div class='wikimessage'>$[Post successful]</div>";

SDV($FmtPV['$CurrentTime'], "\$GLOBALS['CurrentTime']");

SDV($PmFormTemplatesFmt, 
  array('{$SiteGroup}.LocalTemplates', '{$SiteGroup}.PmFormTemplates'));

SDV($PmFormPostPatterns, array(
  "/\r/"   => '',
  '/\\(:/' => '( :',
  '/:\\)/' => ': )',
  '/\\$:/' => '$ :'));

SDVA($InputTags['pmform'], array(
  ':fn' => 'InputActionForm',
  ':args' => array('pmform-target', 'target'),
  ':html' => "<form action='{\$PageUrl}' \$InputFormArgs><input type='hidden' name='n' value='{\$FullName}' /><input type='hidden' name='action' value='pmform' />",
  'method' => 'post'));

SDVA($Conditions, array(
  'validemail' => '(bool)filter_var($condparm, FILTER_VALIDATE_EMAIL)',
));

Markup('pmform', '<input',
  '/\\(:pmform *([-\\w]+)( .*?)?:\\)/',
  "PmFormMarkup");

Markup('ptv:', 'block',
  '/^(\\w[-\\w]+)\\s*:.*$/',
  "<:block,0><div class='property-$1'>$0</div>");

SDV($HandleActions['pmform'], 'HandlePmForm');
SDV($HandleAuth['pmform'], 'edit');

function PmFormConfig($pagename, $target) {
  global $PmForm, $PmFormPageFmt;
  $target_args = @$PmForm[$target];
  if (!$target_args) {
    $page = ReadPage(FmtPageName($PmFormPageFmt, $pagename));
    $pat = preg_quote(strval($target), '/');
    if (preg_match("/^\\s*$pat\\s*:(.*)/m", strval(@$page['text']), $match))
      $target_args = $match[1];
  }
  $target_args = trim(strval($target_args));
  if (!$target_args) return array();
  return ParseArgs(FmtPageName($target_args, $pagename));
}


function PmFormTemplateDirective($text, $pat, &$match) {
  $pat = "/((?<=\n) *)?\\(:template +$pat\\b(.*?):\\)(?(1) *\n)/";
  return preg_match_all($pat, $text, $match, PREG_SET_ORDER);
}


function PmFormTemplateDefaults($pagename, &$text, $args=NULL) {
  $opt = array();
  if (!PmFormTemplateDirective($text, "defaults?", $match)) return $opt;
  foreach($match as $m) {
    if ($args) $m[2] = FmtTemplateVars($m[2], $args);
    $opt = array_merge($opt, ParseArgs($m[2]));
    $args = array_merge($opt, (array)$args);
    $text = str_replace($m[0], '', $text);
  }
  return $opt;
}


function PmFormTemplateRequires($pagename, &$text, $args=NULL) {
  if (!$args) $args = array();
  $errors = array();
  if (!PmFormTemplateDirective($text, "requires?", $match)) return;
  foreach($match as $m) {
    $text = str_replace($m[0], '', $text);
    if ($args) $m[2] = FmtTemplateVars($m[2], $args);
    $opt = ParseArgs($m[2]); $opt[''] = (array)@$opt[''];
    $name = isset($opt['name']) ? $opt['name'] : array_shift($opt['']);
    $name = strval($name);
    $match = '?*';
    if (isset($opt['match'])) $match = $opt['match'];
    else if ($opt['']) $match = array_shift($opt['']);
    list($inclp, $exclp) = GlobToPCRE($match);
    $argsn = ''; # for if= condition without field
    foreach(preg_split('/[\\s,]+/', $name, -1, PREG_SPLIT_NO_EMPTY) as $n) {
      $n = preg_replace('/^\\$:/', 'ptv_', $n);
      $argsn = strval(@$args[$n]);
      if ($match == '' && $args[$n] != ''
          || ($inclp && !preg_match("/$inclp/is", $argsn))
          || ($exclp && preg_match("/$exclp/is", $argsn)))
        $errors[] = isset($opt['errmsg']) ? $opt['errmsg']
                    : "$[Invalid parameter] $n";
    }
    if (@$opt['if'] && !CondText($pagename, trim("if {$opt['if']} $argsn"), 'hello'))
      $errors[] = isset($opt['errmsg']) ? $opt['errmsg']
                  : "$[Required condition failed]";
  }
  return $errors; 
}


function PmFormMarkup($m) {
  global $PmFormTemplatesFmt, $InputTags, $PmFormEnablePmToken;
  static $seen = 0;
  extract($GLOBALS["MarkupToHTML"]);
  @list($ignore, $target, $args) = $m;
  
  if(!$seen++ && isEnabled($PmFormEnablePmToken, true)) {
    pmtoken();
    $InputTags['pmform'][':html'] .= '<input type="hidden" name="$TokenName" value="$TokenValue" />';
  }
  
  $target_opt = PmFormConfig($pagename, $target);
  $markup_opt = ParseArgs($args);
  $markup_opt['target'] = $target;
  $opt = array_merge($target_opt, $markup_opt);
  if (@$opt['form']) 
    $form = RetrieveAuthSection($pagename, $opt['form'], $PmFormTemplatesFmt);
  $form_opt = PmFormTemplateDefaults($pagename, $form);
  $opt = array_merge($form_opt, $target_opt, $markup_opt);
  $form = PVSE(FmtTemplateVars($form, $opt));
  return PRR($form);
}


function HandlePmForm($pagename, $auth = 'read') {
  global $PmFormPostPatterns, $PmFormEnablePmToken, $PmFormTemplatesFmt, $PmFormExitFunction;
  $post_opt = PPRA($PmFormPostPatterns, RequestArgs($_POST));

  $target = @$post_opt['target'];
  $target_opt = PmFormConfig($pagename, $target);
  if (!$target_opt)
    return HandleDispatch($pagename, 'browse', "$[Unknown target] $target");

  if(isEnabled($PmFormEnablePmToken, true) && !pmtoken(1))
    return HandleDispatch($pagename, 'browse', "$[Token invalid or missing.]");
  
  ##  Now, get the message template we will use
  $msgtmpl = RetrieveAuthSection($pagename, @$target_opt['fmt'], 
                                 $PmFormTemplatesFmt);

  $opt = array_merge($post_opt, $target_opt); 
  $template_opt = PmFormTemplateDefaults($pagename, $msgtmpl, $opt);
  $opt = array_merge($template_opt, $post_opt, $target_opt);
  $safe_opt = array_merge($template_opt, $target_opt);
  $errors = PmFormTemplateRequires($pagename, $msgtmpl, $opt);

  if (!$errors && @$safe_opt['saveto']) 
    $errors = PmFormSave($pagename, $msgtmpl, $opt, $safe_opt);

  if (!$errors && @$safe_opt['mailto'])
    $errors = PmFormMail($pagename, $msgtmpl, $opt, $safe_opt);

  SDV($PmFormExitFunction, 'PmFormExit');
  $PmFormExitFunction($pagename, $errors, $opt, $safe_opt);
}

function PmFormExit($pagename, $errors, $opt, $safe_opt) {
  global $MessagesFmt, $PmFormRedirectFunction;
  if ($errors) {
    foreach ((array)$errors as $errmsg) {
      $errmsg = PHSC($errmsg, ENT_NOQUOTES);
      $MessagesFmt[] = "<div class='wikimessage'>$errmsg</div>";
    }
    return HandleDispatch($pagename, 'browse');
  }
  
  SDV($PmFormRedirectFunction,'Redirect');
  if (@$opt['successpage']) $PmFormRedirectFunction(MakePageName($pagename, $opt['successpage']));
  $PmFormRedirectFunction($pagename, '{$PageUrl}?pmform=success');
}



function PmFormSave($pagename, $msgtmpl, $opt, $safe_opt) {
  global $IsPagePosted, $ChangeSummary, $Now, $HandleAuth;
  Lock(2);
  $saveto = MakePageName($pagename, $safe_opt['saveto']);
  $target = @$opt['target'];
  $page = ReadPage($saveto);
  if (preg_match("/.*\\(:pmform +$target( .*?)?:\\).*\n?/", strval(@$page['text']), $mark)) {
    $mark_opt = ParseArgs(strval(@$mark[1]));
    $mark_opt['=mark'] = $mark[0];
    $opt = array_merge($opt, $mark_opt);
    $safe_opt = array_merge($safe_opt, $mark_opt);
  }
  
  if(preg_match('/^(above|below) *(#[-a-zA-Z0-9]+)$/', strval(@$opt['where']), $w)) {
    if(preg_match("/\\[\\[ *{$w[2]} *\]\]/", strval(@$page['text']), $a)) {
      $safe_opt['=mark'] = $a[0];
      $opt['where'] = $safe_opt['where'] = $w[1];
    }
  }

  if (!@$mark) {
    $page = RetrieveAuthPage($saveto, $HandleAuth['pmform'], true);
    if (!$page) return '$[Insufficient permissions]';
  }

  $new = $page;
  $text = @$new['text'];
  $errors = NULL;
  if (preg_match('/\\S/', $msgtmpl)) {
    $msgtext = FmtTemplateVars($msgtmpl, $opt, $saveto);
    $errors = PmFormUpdateText($saveto, $text, $msgtext, $opt, $safe_opt);
  }
  if (!$errors && @$opt['savevars']) 
    $errors = PmFormUpdateVars($saveto, $text, $opt);
  if (!$errors) {
    $new['text'] = $text;
    if (isset($_REQUEST['csum'])) {
      $new['csum'] = $ChangeSummary;
      if ($ChangeSummary) $new["csum:$Now"] = $ChangeSummary;
    }
    UpdatePage($saveto, $page, $new);
    if (!$IsPagePosted) return '$[Unable to save page]';
  }
  return $errors;
}


function PmFormUpdateText($pagename, &$text, $msgtext, $opt, $safe_opt) {
  if (preg_match('/^\\s*([^\\s,]+)/', @$opt['where'], $w)) $where = $w[1];
  else $where = 'new';
  
  if (@$opt['where'] != @$safe_opt['where']) {
    list($inclp, $exclp) = GlobToPCRE(@$safe_opt['where']);
    if (!preg_match("/$inclp/", $where) || preg_match("/$exclp/", $where)) 
      return "$[Invalid 'where' option] 1";
  }
  if ($where == 'new') {
   if (!isset($text)) $text = $msgtext; 
   return NULL; 
  }
  $mark = @$safe_opt['=mark'];

  switch ($where) {
    case 'top'   :  $ipos = 0; $ilen = 0; break;
    case 'bottom':  $ipos = strlen($text); $ilen = 0; break;
    case 'above' :  $ipos = strpos($text, $mark); $ilen = 0; break;
    case 'below' :  $ipos = strpos($text, $mark) + strlen($mark); $ilen = 0; break;
    default:
      return "$[Invalid 'where' option] 2";
  }
  $text = substr_replace($text, $msgtext, $ipos, $ilen);
  return NULL;
}


function PmFormUpdateVars($pagename, &$text, $opt) {
  global $PageTextVarPatterns, $EnablePmFormUpdateReverse;
  if (!@$opt['savevars']) return NULL;
  foreach(preg_split('/[\\s,]+/', $opt['savevars']) as $v) 
    @$savevars[preg_replace('/^\\$:/', '', $v)]++;
  $patterns = IsEnabled($EnablePmFormUpdateReverse) ?
    array_reverse($PageTextVarPatterns, true) : $PageTextVarPatterns;
  foreach($patterns as $pat) {
    if (!preg_match_all($pat, $text, $match, PREG_SET_ORDER)) continue;
    if(IsEnabled($EnablePmFormUpdateReverse)) $match = array_reverse($match);
    foreach($match as $m) {
      $var = $m[2]; if (!@$savevars[$var]) continue;
      $val = $opt["ptv_$var"];
      if (!preg_match('/s[eimu]*$/', $pat))
        $val = str_replace("\n", ' ', $val);
      $text = str_replace($m[0], $m[1] . $val . $m[4], $text);
      unset($savevars[$var]);
    }
  }
  foreach($savevars as $var => $v) {
    $val = $opt["ptv_$var"];
    $text .= "(:$var:$val:)\n";
  }
  return NULL;
}
   
 
function PmFormMail($pagename, $msgtmpl, $opt, $safe_opt) {
  global $PmFormMailHeaders, $PmFormMailParameters, $Charset, $EnablePmFormMailSubjectEncode, $PmFormMailFn;
  SDV($PmFormMailFn, 'mail');
  SDV($PmFormMailHeaders, '');
  SDV($PmFormMailParameters, '');

  if (!preg_match('/\\S/', $msgtmpl)) $msgtmpl = '{$$text}';
  $msgtext = FmtTemplateVars($msgtmpl, $opt, $pagename);
  $mailto = preg_split('/\\s*,\\s*/', @$safe_opt['mailto'], -1, PREG_SPLIT_NO_EMPTY);
  $mailto = implode(', ', $mailto);
  $from = strval(@$opt['from']);
  $subject = strval(@$opt['subject']);
  if (isEnabled($EnablePmFormMailSubjectEncode, 0) && preg_match("/[^\x20-\x7E]/", $subject)) 
    $subject = strtoupper("=?$Charset?B?"). base64_encode($subject)."?=";
  $header = $PmFormMailHeaders;
  if ($from) $header = "From: $from\r\n$header";
  $header = preg_replace("/[\r\n]*$/", '', $header);

  if ($PmFormMailParameters) 
    $tf = $PmFormMailFn($mailto, $subject, $msgtext, $header, $PmFormMailParameters);
  else
    $tf = $PmFormMailFn($mailto, $subject, $msgtext, $header);

  if (!$tf) return '$[An error has occurred]';
  return NULL;
}

