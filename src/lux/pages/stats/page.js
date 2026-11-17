import {html, css} from 'lit';
import {customElement} from 'lit/decorators.js';
import {AIUXElement, decorators} from '@servicenow/aiux/aiux-components-core';
import {i18n} from '@servicenow/aiux/aiux-services';
import {setDocumentTitle} from '../../utils/document-title.js';
import '../../widgets/x-alsoi-stats-dashboard/index.js';

const {acl, title, global} = decorators;

@acl([{roles: ['admin']}])
@title('System Stats')
@global(false)
@customElement('x-alsoi-stats-page-stats-page')
export default class StatsPage extends AIUXElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100%;
    }
  `;

  firstUpdated() {
    setDocumentTitle(i18n.getMessage('System statistics'));
  }

  render() {
    return html`
      <main class="mx-auto w-full max-w-7xl">
        <x-alsoi-stats-dashboard></x-alsoi-stats-dashboard>
      </main>
    `;
  }
}
