import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import './PrivacyPolicy.css';

export default function PrivacyPolicy() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const fromAuth = searchParams.get('from') === 'auth';

  const handleBackFromAuth = () => {
    navigate(-1);
  };

  return (
    <div className="privacy">
      <h1 className="privacy__title">隐私政策</h1>
      <p className="privacy__updated">更新提示：使用本服务即表示您已阅读本政策核心内容；试衣等功能以单独同意为准。</p>

      <section className="privacy__section">
        <h2>一、概述</h2>
        <p>
          本政策说明 Zchoose（以下简称「我们」或「平台」）如何收集、使用、存储、共享、保护您的个人信息，以及您享有的权利。我们遵守《中华人民共和国个人信息保护法》《中华人民共和国网络安全法》等相关法律法规。
        </p>
      </section>

      <section className="privacy__section">
        <h2>二、我们收集的信息</h2>
        <ul>
          <li><strong>账号信息：</strong>手机号码（用于注册、登录与安全验证）等。</li>
          <li><strong>您主动提供的内容：</strong>昵称、头像、投稿图片与描述、客服沟通内容等。</li>
          <li><strong>试穿与体型相关（敏感或高度关联个人信息）：</strong>试衣用<strong>人像照片</strong>；您自愿填写的<strong>身高、体重、性别</strong>；您选择的<strong>体型类型</strong>等。该类信息仅在您<strong>单独同意</strong>后，用于虚拟试衣、BMI/尺码参考展示及履行法定义务所必需的处理。</li>
          <li><strong>使用过程信息：</strong>为提供服务所必需的操作记录、设备或日志信息（在合法、正当、必要范围内）。</li>
        </ul>
      </section>

      <section className="privacy__section" id="试穿与体型数据">
        <h2>三、试穿与体型数据（单独同意）</h2>
        <p>
          虚拟试衣功能需要处理您的人像与身体相关数据。我们将在试衣页面向您展示<strong>《个人信息处理告知与同意（试衣与体型）》</strong>，您勾选同意即构成对该类处理的<strong>单独同意</strong>。若您拒绝同意，将无法使用依赖该等信息的试衣功能。
        </p>
        <p>
          为完成试衣效果生成，我们可能需要将<strong>人像图片及必要的体型参数</strong>传输至<strong>第三方虚拟试衣技术服务</strong>。我们会要求该等主体采取合理安全措施；其具体身份、地域与条款以实际对接的服务为准，您亦可向我们询问当前使用的服务名称。
        </p>
      </section>

      <section className="privacy__section">
        <h2>四、我们如何使用信息</h2>
        <ul>
          <li>提供、维护与改进产品与功能（推荐、衣库、试衣、闲置、会员与积分等）；</li>
          <li>身份验证、安全防范、欺诈监测与争议处理；</li>
          <li>遵守法律法规、响应有权机关要求；</li>
          <li>经您同意的其他用途。</li>
        </ul>
        <p>非经法律法规允许或您另行同意，我们不会将您的个人信息用于与上述目的无关的商业营销。</p>
      </section>

      <section className="privacy__section">
        <h2>五、共享、转让与公开披露</h2>
        <p>
          我们原则上不对外出售您的个人信息。仅在为实现本政策目的、征得您同意或法律法规要求时，向合作伙伴或第三方服务提供者（如试衣 API、云存储、支付机构）提供<strong>必要</strong>信息，并通过合同等方式要求其承担安全保护义务。
        </p>
      </section>

      <section className="privacy__section">
        <h2>六、存储与跨境</h2>
        <p>
          我们在中华人民共和国境内运营中收集和产生的个人信息，原则上存储在境内。若因使用境外技术服务确需跨境传输，我们将依法履行安全评估、认证或标准合同等义务，并告知您境外接收方名称与联系方式（如适用）。
        </p>
      </section>

      <section className="privacy__section">
        <h2>七、保存期限</h2>
        <p>
          我们在实现处理目的所必需的期限内保存个人信息；届满后将删除或匿名化，法律法规另有规定的除外。
        </p>
      </section>

      <section className="privacy__section">
        <h2>八、您的权利</h2>
        <p>在符合法律规定的条件下，您有权：</p>
        <ul>
          <li>查阅、复制您的个人信息；</li>
          <li>更正、补充不准确或不完整的个人信息；</li>
          <li>在法定情形下请求删除；</li>
          <li>撤回对特定处理的同意（不影响撤回前基于同意已进行的处理活动的效力）；</li>
          <li>要求我们对个人信息处理规则进行解释说明；</li>
          <li>法律法规规定的其他权利。</li>
        </ul>
        <p>您可通过「客服与帮助」或本政策末尾联系方式向我们提出申请。我们将在法定期限内答复。</p>
      </section>

      <section className="privacy__section">
        <h2>九、未成年人保护</h2>
        <p>
          若您为未成年人，请在监护人指导下阅读本政策并使用服务。监护人不同意处理的，请停止使用试衣等收集敏感个人信息的功能。
        </p>
      </section>

      <section className="privacy__section">
        <h2>十、本政策的更新</h2>
        <p>
          我们可能适时修订本政策。重大变更时，我们将通过应用内提示等合理方式通知您。若您继续使用服务，即表示同意更新后的政策；您也可停止使用并行使注销或删除权（如适用）。
        </p>
      </section>

      <section className="privacy__section">
        <h2>十一、联系我们</h2>
        <p>
          如您对本政策或个人信息处理有任何疑问、意见或投诉，请通过应用内<strong>客服与帮助</strong>与我们联系。我们将在验证您的身份后尽快回复。
        </p>
      </section>

      <p className="privacy__back">
        {fromAuth ? (
          <>
            <button type="button" className="privacy__back-btn" onClick={handleBackFromAuth}>
              返回注册/登录
            </button>
            <span className="privacy__back-alt"> · </span>
            <Link to="/home">去首页</Link>
          </>
        ) : (
          <Link to="/home">返回首页</Link>
        )}
      </p>
    </div>
  );
}
